const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  express = require("express");
const { randomUUID } = require("node:crypto");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "devmatrix-ops-"));
process.env.DB_ENGINE ||= "local";
process.env.LOCAL_DB_PATH = path.join(directory, "db.json");
process.env.JWT_SECRET = "operations-test-signing-secret-placeholder-123";
const { connectDB, closeDB, getCollection } = require("../config/db");
const { Project } = require("../models/Project");
const { createOperationsRouter } = require("../routes/operations");
const {
  createCloudBuild,
  targetFor,
  redact,
} = require("../services/cloud-build");
const {
  createDomainChecker,
  domainName,
  publicAddress,
  inspectCertificate,
} = require("../services/domains");
const target = {
  googleProject: "example-project",
  region: "us-central1",
  triggerId: "trigger-123",
  repository: "example/commerce",
  branch: "main",
  serviceName: "commerce-staging",
  dnsRecords: [{ type: "CNAME", value: "ghs.googlehosted.com" }],
};
let server,
  base,
  token,
  otherToken,
  project,
  job,
  startCalls = 0,
  status = "WORKING",
  startError;
const provider = {
  async start(t) {
    startCalls++;
    assert.equal(t.repository, "example/commerce");
    if (startError) throw startError;
    return {
      operationName:
        "projects/example-project/locations/us-central1/operations/run-123",
      buildId: "build-123",
      status: "QUEUED",
    };
  },
  async status() {
    return { status, buildId: "build-123" };
  },
  async logs(t, j, kind) {
    return {
      lines: [
        {
          timestamp: "2026-11-03T10:00:00Z",
          severity: "INFO",
          message:
            kind === "runtime" ? "Application started" : "Building image",
        },
      ],
      source: kind,
    };
  },
};
async function request(method, route, body, auth = token) {
  const res = await fetch(base + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer " + auth } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, data: await res.json() };
}
before(async () => {
  await connectDB();
  const app = express();
  app.use(express.json());
  app.use("/api/auth", require("../routes/auth").router);
  app.use(
    "/api/projects",
    createOperationsRouter({
      provider,
      checkDomain: async (domain) => ({
        name: domain.name,
        ownershipVerified: false,
        mappingStatus: "pending_ownership",
        certificate: { status: "pending_ownership" },
        checkedAt: new Date().toISOString(),
        records: { A: [], AAAA: [], CNAME: [] },
        expected: [],
      }),
    }),
  );
  app.use("/api/projects", require("../routes/projects"));
  app.use((err, req, res, next) =>
    res.status(err.status || 500).json({ error: err.message }),
  );
  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = "http://127.0.0.1:" + server.address().port;
  async function register(prefix) {
    const suffix = randomUUID().replaceAll("-", "");
    const r = await request(
      "POST",
      "/api/auth/register",
      {
        firstName: "Operations",
        lastName: "Owner",
        username: prefix + suffix,
        email: prefix + suffix + "@example.com",
        mobile: "+1555" + suffix.slice(0, 14),
        password: "operations-test-passphrase",
        confirmPassword: "operations-test-passphrase",
      },
      null,
    );
    assert.equal(r.status, 201);
    assert.equal(r.data.token, undefined);
    const login = await request(
      "POST",
      "/api/auth/login",
      {
        loginIdentifier: prefix + suffix,
        password: "operations-test-passphrase",
      },
      null,
    );
    assert.equal(login.status, 200);
    return login.data.token;
  }
  token = await register("owner");
  otherToken = await register("other");
  const jwt = require("jsonwebtoken");
  const user = jwt.verify(token, process.env.JWT_SECRET);
  project = await Project.createDefault(user.userId, "Operations test");
});
after(async () => {
  delete process.env.DEPLOYMENT_TARGETS_JSON;
  if (server) await new Promise((r) => server.close(r));
  await closeDB();
  fs.rmSync(directory, { recursive: true, force: true });
});
const route = (suffix) => `/api/projects/${project._id}${suffix}`;
test("unconfigured targets cannot dispatch jobs", async () => {
  const r = await request("GET", route("/deployments"));
  assert.equal(r.status, 200);
  assert.equal(r.data.target, null);
  assert.equal(
    (
      await request("POST", route("/deployments"), {
        requestId: randomUUID(),
        acknowledged: true,
      })
    ).status,
    409,
  );
  assert.equal(startCalls, 0);
});
test("operators bind exact repository; readiness and acknowledgement gate dispatch", async () => {
  process.env.DEPLOYMENT_TARGETS_JSON = JSON.stringify({
    [project._id]: target,
  });
  assert.equal((await request("GET", route("/deployments"))).status, 409);
  project = await Project.save(project, {
    brief: {
      goal: "Deliver an observable commerce application.",
      audience: "Store owners",
      acceptanceCriteria: "Owners can review orders securely.",
      repositoryUrl: "https://github.com/example/commerce",
      owner: "Release owner",
    },
  });
  assert.equal(
    (
      await request("POST", route("/deployments"), {
        requestId: randomUUID(),
        acknowledged: false,
      })
    ).status,
    400,
  );
  assert.equal(startCalls, 0);
});
test("dispatch is persisted, idempotent and blocks parallel jobs", async () => {
  const requestId = randomUUID();
  const r = await request("POST", route("/deployments"), {
    requestId,
    acknowledged: true,
    triggerId: "attacker-trigger",
  });
  assert.equal(r.status, 202);
  job = r.data.deployment;
  assert.equal(job.status, "QUEUED");
  assert.equal(startCalls, 1);
  assert.equal((await request("DELETE", route(""))).status, 409);
  assert.ok(await getCollection("deployments").findOne({ _id: job._id }));
  const replay = await request("POST", route("/deployments"), {
    requestId,
    acknowledged: true,
  });
  assert.equal(replay.data.deployment._id, job._id);
  assert.equal(startCalls, 1);
  assert.equal(
    (
      await request("POST", route("/deployments"), {
        requestId: randomUUID(),
        acknowledged: true,
      })
    ).status,
    409,
  );
});
test("job status and build/runtime logs use provider data, without auto-completing gates", async () => {
  const r = await request("GET", route("/deployments/" + job._id));
  assert.equal(r.data.deployment.status, "WORKING");
  assert.equal(
    (await request("GET", route(`/deployments/${job._id}/logs`))).data.lines[0]
      .message,
    "Building image",
  );
  assert.equal(
    (await request("GET", route(`/deployments/${job._id}/logs?kind=runtime`)))
      .data.lines[0].message,
    "Application started",
  );
  assert.equal(
    (await request("GET", route(`/deployments/${job._id}/logs?kind=arbitrary`)))
      .status,
    400,
  );
  status = "SUCCESS";
  assert.equal(
    (await request("GET", route("/deployments/" + job._id))).data.deployment
      .status,
    "SUCCESS",
  );
  assert.ok(
    (await Project.findById(project._id)).pipelineStages.every(
      (s) => s.status === "pending",
    ),
  );
});
test("operations, logs, and domain configuration enforce tenant ownership", async () => {
  for (const [method, suffix, body] of [
    ["GET", "/deployments"],
    ["POST", "/deployments", { requestId: randomUUID(), acknowledged: true }],
    ["GET", "/deployments/" + job._id],
    ["GET", `/deployments/${job._id}/logs`],
    ["GET", "/domain"],
    ["PUT", "/domain", { name: "app.example.com" }],
    ["POST", "/domain/check", {}],
  ])
    assert.equal(
      (await request(method, route(suffix), body, otherToken)).status,
      404,
      suffix,
    );
});
test("domain challenges remain stable and change when the hostname changes", async () => {
  const a = await request("PUT", route("/domain"), { name: "App.Example.com" });
  assert.equal(a.status, 200);
  assert.equal(a.data.domain.name, "app.example.com");
  const b = await request("PUT", route("/domain"), { name: "app.example.com" });
  assert.equal(b.data.domain.token, a.data.domain.token);
  const c = await request("PUT", route("/domain"), {
    name: "other.example.com",
  });
  assert.notEqual(c.data.domain.token, a.data.domain.token);
  const check = await request("POST", route("/domain/check"), {});
  assert.equal(check.data.domain.lastCheck.mappingStatus, "pending_ownership");
});
test("ambiguous submission is retained and never automatically redispatched", async () => {
  startError = new Error("Timed out after sending request");
  const r = await request("POST", route("/deployments"), {
    requestId: randomUUID(),
    acknowledged: true,
  });
  assert.equal(r.status, 202);
  assert.equal(r.data.deployment.status, "SUBMISSION_UNKNOWN");
  assert.equal(
    (
      await request("POST", route("/deployments"), {
        requestId: randomUUID(),
        acknowledged: true,
      })
    ).status,
    409,
  );
  assert.equal(startCalls, 2);
  startError = null;
});
test("provider contract uses regional APIs, configured source and scoped log filters", async () => {
  const calls = [];
  const client = createCloudBuild(async (options) => {
    calls.push(options);
    if (options.url.includes(":run"))
      return {
        name: "projects/example-project/locations/us-central1/operations/op-1",
        metadata: { build: { id: "b-1", status: "QUEUED" } },
      };
    if (options.url.includes("entries:list"))
      return {
        entries: [
          {
            textPayload: "token=do-not-show",
            timestamp: "2026-11-03T10:00:00Z",
          },
        ],
      };
    return {
      id: "b-1",
      status: "SUCCESS",
      logUrl: "https://console.cloud.google.com/cloud-build/builds/b-1",
    };
  });
  const started = await client.start(target);
  assert.equal(started.buildId, "b-1");
  assert.equal(calls[0].data.projectId, target.googleProject);
  assert.equal(calls[0].data.triggerId, target.triggerId);
  assert.deepEqual(calls[0].data.source, { branchName: "main" });
  assert.equal((await client.status(target, started)).status, "SUCCESS");
  assert.match(calls[1].url, /locations\/us-central1\/builds\/b-1$/);
  const logs = await client.logs(
    target,
    { buildId: "b-1", createdAt: "2026-11-03T10:00:00Z" },
    "runtime",
  );
  assert.match(calls[2].data.filter, /service_name="commerce-staging"/);
  assert.deepEqual(calls[2].data.resourceNames, ["projects/example-project"]);
  assert.equal(logs.lines[0].message, "token=[redacted]");
  assert.equal(
    redact("Bearer abc123 mysql://user:pass@db.example.com"),
    "Bearer [redacted] mysql://[redacted]@db.example.com",
  );
});
test("DNS ownership and public-address checks prevent private TLS probes", async () => {
  let inspected = 0;
  let txt = [],
    addresses = ["8.8.8.8"];
  const resolver = {
    resolve4: async () => addresses,
    resolve6: async () => [],
    resolveCname: async () => ["ghs.googlehosted.com."],
    resolveTxt: async () => txt,
  };
  const check = createDomainChecker(resolver, async (name, address) => {
    inspected++;
    assert.equal(address, "8.8.8.8");
    return { status: "valid" };
  });
  const domain = { name: "app.example.com", token: "public-challenge" };
  assert.equal(
    (await check(domain, target)).mappingStatus,
    "pending_ownership",
  );
  assert.equal(inspected, 0);
  txt = [["devmatrix-verification=public-", "challenge"]];
  assert.equal((await check(domain, target)).mappingStatus, "matches");
  assert.equal(inspected, 1);
  addresses = ["127.0.0.1"];
  assert.equal((await check(domain, target)).certificate.status, "blocked");
  assert.equal(inspected, 1);
  addresses = ["8.8.8.8", "169.254.169.254"];
  assert.equal((await check(domain, target)).mappingStatus, "blocked");
  assert.equal(inspected, 1);
});
test("domain validation rejects URLs, private literals and reserved names", () => {
  for (const name of [
    "https://example.com",
    "example.com:443",
    "127.0.0.1",
    "[::1]",
    "metadata.google.internal",
    "app.local",
    "localhost",
    "name/with/path",
  ])
    assert.throws(() => domainName(name));
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "192.0.2.1",
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(domainName("App.Example.com."), "app.example.com");
});
test("TLS inspection pins the public address and retains certificate verification", async (t) => {
  const { EventEmitter } = require("node:events");
  const tls = require("node:tls");
  let socket;
  t.mock.method(tls, "connect", (options) => {
    assert.equal(options.host, "8.8.8.8");
    assert.equal(options.servername, "app.example.com");
    assert.equal(options.rejectUnauthorized, true);
    socket = new EventEmitter();
    socket.destroy = () => {};
    socket.setTimeout = () => {};
    return socket;
  });
  const pending = inspectCertificate("app.example.com", "8.8.8.8");
  socket.authorized = true;
  socket.getPeerCertificate = () => ({
    valid_to: new Date(Date.now() + 30 * 86400000).toISOString(),
    issuer: { O: "Test CA" },
  });
  socket.emit("secureConnect");
  assert.equal((await pending).status, "valid");
  const invalid = inspectCertificate("app.example.com", "8.8.8.8");
  socket.emit("error", { code: "CERT_HAS_EXPIRED" });
  assert.equal((await invalid).status, "invalid");
});
