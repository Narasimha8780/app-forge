const express = require("express");
const { Project } = require("../models/Project");
const { authMiddleware } = require("./auth");
const {
  STACKS,
  DATABASES,
  createCleanStages,
  readiness,
  httpUrl,
  validateBrief,
} = require("../services/pipeline");
const { blueprint } = require("../services/blueprint");
const router = express.Router();
router.use(authMiddleware);
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const nameOf = (name) => {
  if (typeof name !== "string" || !name.trim() || name.length > 100)
    fail("Application name must be 1–100 characters");
  return name.trim();
};
function present(p) {
  // Legacy stages were set complete without execution. Require new evidence.
  const stages = createCleanStages().map((s) => {
    const old = p.pipelineStages?.find((o) => o.id === s.id);
    return old?.evidence?.source === "owner_attestation" ? { ...s, ...old } : s;
  });
  const next = { ...p, pipelineStages: stages };
  delete next.envVars;
  delete next.integrations;
  return { ...next, readiness: readiness(next) };
}
router.get(
  "/",
  wrap(async (req, res) =>
    res.json({
      success: true,
      projects: (await Project.findByUserId(req.user.userId)).map(present),
      stacks: STACKS,
      databases: DATABASES,
    }),
  ),
);
router.post(
  "/",
  wrap(async (req, res) => {
    const name = nameOf(req.body.name);
    const { stack = "node", database = "postgres" } = req.body;
    if (!Object.hasOwn(STACKS, stack) || !Object.hasOwn(DATABASES, database))
      fail("Select a supported stack and database");
    res
      .status(201)
      .json({
        success: true,
        project: present(
          await Project.createDefault(req.user.userId, name, {
            stack,
            database,
          }),
        ),
      });
  }),
);
// All per-project routes share ownership enforcement, including export and edits.
router.use(
  "/:id",
  wrap(async (req, res, next) => {
    const p = await Project.findById(req.params.id);
    if (!p || String(p.userId) !== req.user.userId)
      fail("Application not found", 404);
    req.project = p;
    next();
  }),
);
router.get(
  "/:id",
  wrap(async (req, res) =>
    res.json({ success: true, project: present(req.project) }),
  ),
);
router.put(
  "/:id/brief",
  wrap(async (req, res) => {
    const { stack, database } = req.body;
    if (!Object.hasOwn(STACKS, stack) || !Object.hasOwn(DATABASES, database))
      fail("Select a supported stack and database");
    const brief = validateBrief(req.body.brief || {});
    const current = present(req.project);
    // Material scope changes require fresh gate evidence; an unchanged save is safe.
    const changed =
      stack !== req.project.stack ||
      database !== req.project.database ||
      JSON.stringify(brief) !== JSON.stringify(req.project.brief || {});
    const pipelineStages = changed
      ? createCleanStages()
      : current.pipelineStages;
    const p = await Project.save(req.project, {
      name: nameOf(req.body.name),
      brief,
      stack,
      database,
      pipelineStages,
    });
    res.json({ success: true, project: present(p), reset: changed });
  }),
);
router.put(
  "/:id/rename",
  wrap(async (req, res) =>
    res.json({
      success: true,
      project: present(
        await Project.save(req.project, { name: nameOf(req.body.name) }),
      ),
    }),
  ),
);
router.delete(
  "/:id",
  wrap(async (req, res) => {
    await Project.deleteProject(req.params.id);
    res.json({ success: true });
  }),
);
router.post(
  "/:id/pipeline/run",
  wrap(async (req, res) => {
    const p = present(req.project);
    const review = readiness(p);
    res.json({
      success: true,
      readiness: review,
      project: p,
      message: review.ready
        ? "Brief is ready. Work through each gate and record evidence. No external build or deployment was triggered."
        : "Complete the highlighted brief fields before recording stage evidence.",
    });
  }),
);
router.put(
  "/:id/step/:stepNum",
  wrap(async (req, res) => {
    const p = present(req.project);
    const step = Number(req.params.stepNum);
    if (!Number.isInteger(step) || step < 1 || step > 8) fail("Invalid stage");
    if (!readiness(p).ready) fail("Complete the project brief first", 409);
    if (
      p.pipelineStages.slice(0, step - 1).some((s) => s.status !== "completed")
    )
      fail("Complete earlier stages first", 409);
    const { summary, url, acknowledged } = req.body;
    if (
      typeof summary !== "string" ||
      summary.trim().length < 20 ||
      summary.length > 4000
    )
      fail("Describe the outcome in 20–4000 characters");
    if (!httpUrl(url) || url.length > 2000)
      fail("Provide an HTTPS evidence link without credentials");
    if (acknowledged !== true) fail("Confirm that you reviewed this evidence");
    if (p.pipelineStages[step - 1].status === "completed")
      fail(
        "Stage already recorded. Change the brief to start a new delivery cycle.",
        409,
      );
    const timestamp = new Date().toISOString();
    p.pipelineStages[step - 1] = {
      ...p.pipelineStages[step - 1],
      status: "completed",
      timestamp,
      evidence: {
        source: "owner_attestation",
        summary: summary.trim(),
        url,
        recordedBy: req.user.userId,
        recordedAt: timestamp,
      },
      logs: [
        `${timestamp} Evidence recorded by project owner. External execution is not independently verified.`,
      ],
    };
    const saved = await Project.save(req.project, {
      pipelineStages: p.pipelineStages,
    });
    res.json({ success: true, project: present(saved) });
  }),
);
router.get(
  "/:id/export",
  wrap(async (req, res) =>
    res.json({ success: true, ...blueprint(req.project) }),
  ),
);
// Do not persist plaintext runtime secrets or pretend toggles connect providers.
router.put("/:id/env", (req, res) =>
  res
    .status(410)
    .json({
      success: false,
      error:
        "Store runtime secrets in your deployment provider’s secret manager.",
    }),
);
router.put("/:id/integrations", (req, res) =>
  res
    .status(410)
    .json({
      success: false,
      error:
        "Configure integrations in your application and record evidence in stage 2.",
    }),
);
module.exports = router;
