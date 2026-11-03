const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "devmatrix-test-"));
process.env.DB_ENGINE ||= "local";
process.env.LOCAL_DB_PATH = path.join(directory, "db.json");
process.env.JWT_SECRET ||= "test-only-signing-key-not-a-production-secret";
const { startServer } = require("../server");
const { closeDB, connectDB } = require("../config/db");
const { readiness, createCleanStages } = require("../services/pipeline");
let server, base, token, otherToken, project;
async function request(method, endpoint, body, auth = token) {
  const res = await fetch(base + endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer " + auth } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, data: await res.json() };
}
async function register(username) {
  const r = await request(
    "POST",
    "/api/auth/register",
    {
      firstName: "Test",
      lastName: "Owner",
      username,
      email: username + "@example.com",
      mobile: "+1555" + Math.random().toString().slice(2, 12),
      password: "Testing-unique-passphrase",
      confirmPassword: "Testing-unique-passphrase",
    },
    null,
  );
  assert.equal(r.status, 201);
  return r.data.token;
}
before(async () => {
  server = await startServer(0);
  base = "http://127.0.0.1:" + server.address().port;
  token = await register("owner_" + Date.now());
  otherToken = await register("other_" + Date.now());
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await closeDB();
  fs.rmSync(directory, { recursive: true, force: true });
});
const brief = {
  goal: "Help stores accept and track online orders.",
  audience: "Store owners and customers",
  acceptanceCriteria: "Customers can place orders and owners can review them.",
  repositoryUrl: "https://github.com/example/commerce",
  owner: "Release owner",
  notes: "Review accessibility, backup restoration, and monthly costs.",
};
test("stage blueprint is clean and readiness reports missing requirements", () => {
  const stages = createCleanStages();
  assert.equal(stages.length, 8);
  assert.ok(
    stages.every(
      (s) => s.status === "pending" && !s.evidence && s.checklist.length,
    ),
  );
  assert.equal(readiness({ brief: {}, pipelineStages: stages }).ready, false);
});
test("health checks active storage and pages serve with security headers", async () => {
  const r = await request("GET", "/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.data.database.engine, process.env.DB_ENGINE);
  for (const route of ["/", "/auth", "/dashboard"]) {
    const res = await fetch(base + route);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /devmatrix/i);
    assert.match(
      res.headers.get("content-security-policy"),
      /script-src 'self'/,
    );
  }
});
test("protected routes reject anonymous callers and public inbox is unavailable", async () => {
  assert.equal(
    (await request("GET", "/api/projects", undefined, null)).status,
    401,
  );
  assert.equal(
    (await request("GET", "/api/contact", undefined, null)).status,
    404,
  );
});
test("invalid registration fields do not reach query operators", async () => {
  const r = await request(
    "POST",
    "/api/auth/register",
    { username: { $ne: null } },
    null,
  );
  assert.equal(r.status, 400);
  assert.equal(
    (
      await request(
        "POST",
        "/api/auth/login",
        { loginIdentifier: { $ne: null }, password: "whatever" },
        null,
      )
    ).status,
    400,
  );
});
test("create validates stack and database and returns clean project", async () => {
  for (const stack of ["shell", "__proto__", "constructor"])
    assert.equal(
      (
        await request("POST", "/api/projects", {
          name: "App",
          stack,
          database: "mysql",
        })
      ).status,
      400,
    );
  const r = await request("POST", "/api/projects", {
    name: "Commerce <API>",
    stack: "java",
    database: "mysql",
  });
  assert.equal(r.status, 201);
  project = r.data.project;
  assert.equal(project.stack, "java");
  assert.equal(project.database, "mysql");
  assert.ok(project.pipelineStages.every((s) => s.status === "pending"));
  assert.equal(project.envVars, undefined);
});
test("ownership enforced on reads, export, brief, stage, env, integration, rename and delete", async () => {
  for (const [method, suffix, body] of [
    ["GET", "", undefined],
    ["GET", "/export", undefined],
    ["PUT", "/brief", {}],
    ["PUT", "/step/1", {}],
    ["PUT", "/env", {}],
    ["PUT", "/integrations", {}],
    ["PUT", "/rename", { name: "stolen" }],
    ["POST", "/pipeline/run", {}],
    ["DELETE", "", undefined],
  ]) {
    assert.equal(
      (
        await request(
          method,
          `/api/projects/${project._id}${suffix}`,
          body,
          otherToken,
        )
      ).status,
      404,
      method + suffix,
    );
  }
});
test("readiness review cannot mark stages complete; incomplete brief blocks stage evidence", async () => {
  const r = await request(
    "POST",
    `/api/projects/${project._id}/pipeline/run`,
    {},
  );
  assert.equal(r.data.readiness.ready, false);
  assert.ok(r.data.project.pipelineStages.every((s) => s.status === "pending"));
  assert.equal(
    (
      await request("PUT", `/api/projects/${project._id}/step/1`, {
        summary: "Some work was completed today.",
        url: "https://example.com/report",
        acknowledged: true,
      })
    ).status,
    409,
  );
});
test("save brief validates URLs and enables ordered pipeline", async () => {
  const endpoint = `/api/projects/${project._id}/brief`;
  assert.equal(
    (
      await request("PUT", endpoint, {
        name: "App",
        stack: "java",
        database: "mysql",
        brief: { ...brief, repositoryUrl: "javascript:alert(1)" },
      })
    ).status,
    400,
  );
  const r = await request("PUT", endpoint, {
    name: "Commerce",
    stack: "java",
    database: "mysql",
    brief,
  });
  assert.equal(r.status, 200);
  project = r.data.project;
  assert.equal(project.readiness.ready, true);
});
test("stages reject skipped prerequisites, forged status, unsafe evidence and missing acknowledgement", async () => {
  const evidence = {
    summary: "Reviewed the documented outcome and supporting report.",
    url: "https://example.com/evidence",
    acknowledged: true,
  };
  assert.equal(
    (await request("PUT", `/api/projects/${project._id}/step/2`, evidence))
      .status,
    409,
  );
  for (const body of [
    { status: "completed" },
    { ...evidence, url: "javascript:alert(1)" },
    { ...evidence, acknowledged: false },
    { ...evidence, url: "https://secret:password@example.com" },
  ])
    assert.equal(
      (await request("PUT", `/api/projects/${project._id}/step/1`, body))
        .status,
      400,
    );
  for (let step = 1; step <= 8; step++) {
    const r = await request(
      "PUT",
      `/api/projects/${project._id}/step/${step}`,
      evidence,
    );
    assert.equal(r.status, 200);
    assert.equal(
      r.data.project.pipelineStages[step - 1].evidence.source,
      "owner_attestation",
    );
    project = r.data.project;
  }
  assert.equal(project.readiness.nextStep, null);
  assert.equal(
    (await request("PUT", `/api/projects/${project._id}/step/8`, evidence))
      .status,
    409,
  );
});
test("runtime templates match Java, Python, Node and contain no saved secret values", async () => {
  for (const stack of ["java", "python", "node"]) {
    await request("PUT", `/api/projects/${project._id}/brief`, {
      name: "Commerce",
      stack,
      database: "postgres",
      brief,
    });
    const r = await request("GET", `/api/projects/${project._id}/export`);
    assert.equal(r.status, 200);
    assert.match(
      r.data.dockerfile,
      stack === "java"
        ? /temurin:21/
        : stack === "python"
          ? /python:3.12/
          : /node:24/,
    );
    assert.match(r.data.envTemplate, /DATABASE_URL/);
    assert.doesNotMatch(r.data.dockerfile, /secret-value/);
  }
});
test("scope changes invalidate prior evidence and secret persistence endpoints are retired", async () => {
  const r = await request("GET", `/api/projects/${project._id}`);
  assert.ok(r.data.project.pipelineStages.every((s) => s.status === "pending"));
  assert.equal(
    (
      await request("PUT", `/api/projects/${project._id}/env`, {
        envVars: [{ key: "PASSWORD", value: "secret-value" }],
      })
    ).status,
    410,
  );
});
test("contact form stores valid inquiries and rejects malformed fields", async () => {
  assert.equal(
    (
      await request("POST", "/api/contact", {
        name: { a: 1 },
        email: "test@example.com",
        message: "Hello",
      })
    ).status,
    400,
  );
  const r = await request("POST", "/api/contact", {
    name: "Prospective client",
    email: "client@example.com",
    message: "We need help with application delivery.",
  });
  assert.equal(r.status, 201);
});

test("database reconnect retains project and evidence safely", async () => {
  const before = (await request("GET", `/api/projects/${project._id}`)).data
    .project;
  await closeDB();
  await connectDB();
  const restored = await request("GET", `/api/projects/${project._id}`);
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.data.project, before);
});
test("stale concurrent writes are rejected instead of overwriting evidence", async () => {
  const { Project } = require("../models/Project");
  const snapshot = await Project.findById(project._id);
  await Project.save(snapshot, { name: "Current revision" });
  await assert.rejects(
    Project.save(snapshot, { name: "Stale revision" }),
    /changed/,
  );
  assert.equal((await Project.findById(project._id)).name, "Current revision");
});
test("production refuses ephemeral storage and missing signing secrets", () => {
  const { spawnSync } = require("node:child_process");
  const missing = spawnSync(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DB_ENGINE: "local",
      JWT_SECRET: "",
    },
    encoding: "utf8",
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /JWT_SECRET/);
  const local = spawnSync(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      DB_ENGINE: "local",
      JWT_SECRET: "production-validation-placeholder-123456789",
    },
    encoding: "utf8",
  });
  assert.equal(local.status, 1);
  assert.match(local.stderr, /Production requires/);
});
