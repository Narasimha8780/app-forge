const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { ObjectId, getCollection } = require("../config/db");
const { Project } = require("../models/Project");
const { authMiddleware } = require("./auth");
const { readiness } = require("../services/pipeline");
const {
  createCloudBuild,
  targetFor,
  publicTarget,
  sameTarget,
  terminalStatuses,
} = require("../services/cloud-build");
const {
  domainName,
  challenge,
  createDomainChecker,
} = require("../services/domains");
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const jobs = () => getCollection("deployments");
function publicJob(job) {
  const { target, ...rest } = job;
  return rest;
}
function providerError(res, error, action) {
  const code = error.response?.status || error.status;
  const message =
    code === 403
      ? "The runtime service account does not have the required permission."
      : code === 404
        ? "The configured trigger, build, or service was not found."
        : code === 401
          ? "Google authentication is unavailable."
          : "The provider could not be reached. Check runtime identity, enabled APIs, and provider availability.";
  res.status(502).json({ success: false, error: action + " " + message });
}
function createOperationsRouter({
  provider = createCloudBuild(),
  checkDomain = createDomainChecker(),
} = {}) {
  const router = express.Router();
  router.use(authMiddleware);
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
  const dispatchLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => req.user.userId,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      success: false,
      error: "Too many deployment requests. Try again later.",
    },
  });
  const checkLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    keyGenerator: (req) => req.user.userId,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, error: "Please wait before checking again." },
  });
  router.get(
    "/:id/deployments",
    wrap(async (req, res) => {
      const target = targetFor(req.project);
      const records = await (
        await jobs().find({ projectId: String(req.project._id) })
      ).toArray();
      records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json({
        success: true,
        target: publicTarget(target),
        workspaceId: String(req.project._id),
        deployments: records.slice(0, 20).map(publicJob),
      });
    }),
  );
  router.post(
    "/:id/deployments",
    dispatchLimit,
    wrap(async (req, res) => {
      const { requestId, acknowledged } = req.body;
      if (typeof requestId !== "string" || !/^[a-f\d-]{36}$/i.test(requestId))
        fail("A unique request ID is required.");
      const existing = await jobs().findOne({
        projectId: String(req.project._id),
        requestId,
      });
      if (existing)
        return res.json({
          success: true,
          deployment: publicJob(existing),
          replayed: true,
        });
      const target = targetFor(req.project);
      if (!target)
        fail(
          "Ask the operator to approve a Cloud Build target for this workspace.",
          409,
        );
      if (!readiness(req.project).ready)
        fail("Complete and save the project brief first.", 409);
      if (acknowledged !== true)
        fail(
          "Confirm that this trigger may build and deploy the configured application.",
        );
      if (req.project.activeDeploymentId) {
        const active = await jobs().findOne({
          _id: req.project.activeDeploymentId,
        });
        if (active && !terminalStatuses.has(active.status))
          fail(
            "A deployment is active or its submission is unresolved. Refresh it or ask the operator to reconcile it before retrying.",
            409,
          );
      }
      const record = {
        _id: new ObjectId().toString(),
        projectId: String(req.project._id),
        userId: req.user.userId,
        requestId,
        target,
        status: "SUBMITTING",
        createdAt: new Date().toISOString(),
      };
      await jobs().insertOne(record);
      try {
        await Project.save(req.project, { activeDeploymentId: record._id });
      } catch (error) {
        await jobs().deleteOne({ _id: record._id });
        throw error;
      }
      try {
        const state = await provider.start(target);
        await jobs().updateOne({ _id: record._id }, { $set: state });
        res.status(202).json({
          success: true,
          deployment: publicJob({ ...record, ...state }),
        });
      } catch (error) {
        // A timeout may occur after Google accepted a job. Never submit again automatically.
        const denied =
          error.notSubmitted ||
          [400, 401, 403, 404].includes(error.response?.status);
        const state = {
          status: denied ? "FAILURE" : "SUBMISSION_UNKNOWN",
          message: denied
            ? "The trigger request was not accepted. Check runtime identity, configuration, and IAM."
            : "Submission outcome is unknown. Ask the operator to inspect Cloud Build before allowing another run.",
        };
        await jobs().updateOne({ _id: record._id }, { $set: state });
        res.status(denied ? 502 : 202).json({
          success: !denied,
          deployment: publicJob({ ...record, ...state }),
          ...(denied ? { error: state.message } : {}),
        });
      }
    }),
  );
  async function jobFor(req) {
    if (!/^[a-f\d]{24}$/i.test(req.params.jobId))
      fail("Deployment not found", 404);
    const job = await jobs().findOne({
      _id: req.params.jobId,
      projectId: String(req.project._id),
    });
    if (!job) fail("Deployment not found", 404);
    const target = targetFor(req.project);
    if (!target || !sameTarget(target, job.target))
      fail(
        "This deployment target changed or was removed. Ask the operator to inspect the original job in Google Cloud.",
        409,
      );
    return { job, target };
  }
  router.get(
    "/:id/deployments/:jobId",
    wrap(async (req, res) => {
      const { job, target } = await jobFor(req);
      if (
        terminalStatuses.has(job.status) ||
        ["SUBMISSION_UNKNOWN", "SUBMITTING"].includes(job.status)
      )
        return res.json({ success: true, deployment: publicJob(job) });
      try {
        const state = await provider.status(target, job);
        const updated = await jobs().updateOne(
          { _id: job._id, status: job.status },
          { $set: state },
        );
        const latest = updated.matchedCount
          ? { ...job, ...state }
          : await jobs().findOne({ _id: job._id });
        res.json({ success: true, deployment: publicJob(latest) });
      } catch (error) {
        providerError(res, error, "Cannot refresh the build.");
      }
    }),
  );
  router.get(
    "/:id/deployments/:jobId/logs",
    checkLimit,
    wrap(async (req, res) => {
      const { job, target } = await jobFor(req);
      const kind = req.query.kind || "build";
      if (!["build", "runtime"].includes(kind))
        fail("Choose build or runtime logs.");
      try {
        res.json({
          success: true,
          ...(await provider.logs(target, job, kind)),
        });
      } catch (error) {
        providerError(res, error, "Cannot read logs.");
      }
    }),
  );
  router.get(
    "/:id/domain",
    wrap(async (req, res) =>
      res.json({
        success: true,
        domain: req.project.domain || null,
        workspaceId: String(req.project._id),
      }),
    ),
  );
  router.put(
    "/:id/domain",
    wrap(async (req, res) => {
      const name = domainName(req.body.name);
      const domain =
        req.project.domain?.name === name
          ? req.project.domain
          : challenge(name);
      await Project.save(req.project, { domain });
      res.json({ success: true, domain });
    }),
  );
  router.post(
    "/:id/domain/check",
    checkLimit,
    wrap(async (req, res) => {
      if (!req.project.domain) fail("Save your domain first.");
      const target = targetFor(req.project);
      try {
        const result = await checkDomain(req.project.domain, target);
        const domain = { ...req.project.domain, lastCheck: result };
        await Project.save(req.project, { domain });
        res.json({ success: true, domain });
      } catch (error) {
        if (error.status) throw error;
        res.status(502).json({
          success: false,
          error:
            "DNS checking is unavailable. Try again later; no result has been marked successful.",
        });
      }
    }),
  );
  return router;
}
module.exports = { createOperationsRouter };
