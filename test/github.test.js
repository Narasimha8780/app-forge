const { test, before, after } = require("node:test");
const assert = require("node:assert/strict"),
  express = require("express"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "devmatrix-github-"));
process.env.DB_ENGINE ||= "local";
process.env.LOCAL_DB_PATH = path.join(directory, "db.json");
process.env.JWT_SECRET = "github-test-signing-secret-placeholder-123456";
const { connectDB, closeDB, getCollection } = require("../config/db");
const { Project } = require("../models/Project");
const { createGitHubRouter } = require("../routes/github");
const {
  createGitHub,
  encryptToken,
  decryptToken,
} = require("../services/github");
let base,
  server,
  token,
  otherToken,
  project,
  exchangeCalls = 0,
  revokeCalls = 0;
const accessToken = "gho-fixture-token-not-a-real-credential";
const provider = {
  async exchange(config, code, verifier) {
    exchangeCalls++;
    assert.equal(code, "fixture-code");
    assert.match(verifier, /^[\w-]{43}$/);
    return {
      token: accessToken,
      githubId: 123,
      login: "example-developer",
      scopes: ["read:user"],
    };
  },
  async repositories(token, page) {
    assert.equal(token, accessToken);
    return {
      repositories: [
        {
          id: 1,
          fullName: "example/commerce",
          url: "https://github.com/example/commerce",
          private: false,
          defaultBranch: "main",
        },
      ],
      hasMore: false,
    };
  },
  async revoke(config, token) {
    assert.equal(token, accessToken);
    revokeCalls++;
  },
};
async function request(method, route, body, auth = token, cookie) {
  const response = await fetch(base + route, {
    method,
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer " + auth } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    headers: response.headers,
    data: response.status === 302 ? null : await response.json(),
  };
}
before(async () => {
  await connectDB();
  const app = express();
  app.use(express.json());
  app.use("/api/auth", require("../routes/auth").router);
  app.use("/api/github", createGitHubRouter({ provider }));
  app.use((err, req, res, next) =>
    res.status(err.status || 500).json({ error: err.message }),
  );
  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = "http://127.0.0.1:" + server.address().port;
  async function register() {
    const suffix = randomUUID().replaceAll("-", "");
    const r = await request(
      "POST",
      "/api/auth/register",
      {
        firstName: "Github",
        lastName: "Owner",
        username: "gh" + suffix,
        email: "gh" + suffix + "@example.com",
        mobile: "+1555" + suffix.slice(0, 14),
        password: "github-connection-passphrase",
        confirmPassword: "github-connection-passphrase",
      },
      null,
    );
    assert.equal(r.status, 201);
    assert.equal(r.data.token, undefined);
    const login = await request(
      "POST",
      "/api/auth/login",
      {
        loginIdentifier: "gh" + suffix,
        password: "github-connection-passphrase",
      },
      null,
    );
    assert.equal(login.status, 200);
    return login.data.token;
  }
  token = await register();
  otherToken = await register();
  const user = require("jsonwebtoken").verify(token, process.env.JWT_SECRET);
  project = await Project.createDefault(user.userId, "Explicitly created app");
});
after(async () => {
  for (const name of [
    "APP_BASE_URL",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GITHUB_OAUTH_SCOPE",
  ])
    delete process.env[name];
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDB();
  fs.rmSync(directory, { recursive: true, force: true });
});
test("GitHub setup is explicit and unauthenticated callers cannot read connections", async () => {
  assert.equal(
    (await request("GET", "/api/github/status", undefined, null)).status,
    401,
  );
  const r = await request("GET", "/api/github/status");
  assert.equal(r.data.configured, false);
  assert.equal(r.data.connected, false);
  assert.equal(
    (await request("POST", "/api/github/authorize", { projectId: project._id }))
      .status,
    409,
  );
});
test("authorization uses PKCE, an HttpOnly state cookie, and only owned project return targets", async () => {
  process.env.APP_BASE_URL = base;
  process.env.GITHUB_CLIENT_ID = "fixture-client";
  process.env.GITHUB_CLIENT_SECRET = "fixture-secret";
  assert.equal(
    (
      await request(
        "POST",
        "/api/github/authorize",
        { projectId: project._id },
        otherToken,
      )
    ).status,
    404,
  );
  const r = await request("POST", "/api/github/authorize", {
    projectId: project._id,
  });
  assert.equal(r.status, 200);
  const url = new URL(r.data.url);
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "read:user");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    base + "/api/github/callback",
  );
  const cookie = r.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\/api\/github\/callback/);
  const signed = decodeURIComponent(
    cookie.split(";")[0].split("=").slice(1).join("="),
  );
  const payload = require("jsonwebtoken").decode(signed);
  assert.equal(
    url.searchParams.get("code_challenge"),
    createHash("sha256").update(payload.verifier).digest("base64url"),
  );
  assert.ok(!r.data.url.includes("fixture-secret"));
  assert.ok(!r.data.url.includes("verifier"));
});
test("callback rejects missing cookies and incorrect state before exchanging credentials", async () => {
  assert.equal(
    (
      await request(
        "GET",
        "/api/github/callback?code=fixture-code&state=wrong",
        undefined,
        null,
      )
    ).headers.get("location"),
    "/dashboard?github=error",
  );
  const authorize = await request("POST", "/api/github/authorize", {
    projectId: project._id,
  });
  const cookie = authorize.headers.get("set-cookie").split(";")[0];
  const bad = await request(
    "GET",
    "/api/github/callback?code=fixture-code&state=wrong",
    undefined,
    null,
    cookie,
  );
  assert.equal(bad.headers.get("location"), "/dashboard?github=error");
  assert.equal(exchangeCalls, 0);
});
test("successful OAuth stores an encrypted token and exposes only account metadata", async () => {
  const authorize = await request("POST", "/api/github/authorize", {
    projectId: project._id,
  });
  const url = new URL(authorize.data.url),
    cookie = authorize.headers.get("set-cookie").split(";")[0];
  const r = await request(
    "GET",
    "/api/github/callback?code=fixture-code&state=" +
      url.searchParams.get("state"),
    undefined,
    null,
    cookie,
  );
  assert.equal(r.status, 302);
  assert.equal(
    r.headers.get("location"),
    "/dashboard?project=" + project._id + "&github=connected",
  );
  assert.equal(exchangeCalls, 1);
  assert.doesNotMatch(r.headers.get("set-cookie"), /Max-Age/);
  const status = await request("GET", "/api/github/status");
  assert.equal(status.data.login, "example-developer");
  assert.equal(status.data.connected, true);
  assert.ok(!JSON.stringify(status.data).includes(accessToken));
  const user = require("jsonwebtoken").verify(token, process.env.JWT_SECRET);
  const connection = await getCollection("github_connections").findOne({
    _id: user.userId,
  });
  assert.notEqual(connection.encryptedToken, accessToken);
  assert.equal(decryptToken(connection.encryptedToken), accessToken);
  assert.ok(!JSON.stringify(connection).includes(accessToken));
});
test("repository lists and disconnect are isolated to the connected platform account", async () => {
  const r = await request("GET", "/api/github/repositories?page=1");
  assert.equal(r.status, 200);
  assert.equal(
    r.data.repositories[0].url,
    "https://github.com/example/commerce",
  );
  assert.ok(!JSON.stringify(r.data).includes(accessToken));
  assert.equal(
    (await request("GET", "/api/github/repositories", undefined, otherToken))
      .status,
    409,
  );
  assert.equal(
    (await request("GET", "/api/github/status", undefined, otherToken)).data
      .connected,
    false,
  );
  assert.equal(
    (await request("GET", "/api/github/repositories?page=-1")).status,
    400,
  );
  assert.equal(
    (await request("DELETE", "/api/github/connection", undefined, otherToken))
      .status,
    200,
  );
  assert.equal(revokeCalls, 0);
  assert.equal(
    (await request("GET", "/api/github/status")).data.connected,
    true,
  );
  const disconnected = await request("DELETE", "/api/github/connection");
  assert.equal(disconnected.data.revokeRequired, false);
  assert.equal(revokeCalls, 1);
  assert.equal(
    (await request("GET", "/api/github/status")).data.connected,
    false,
  );
});
test("encryption detects tampering and provider calls use fixed GitHub endpoints", async () => {
  const encrypted = encryptToken(accessToken);
  assert.equal(decryptToken(encrypted), accessToken);
  const parts = encrypted.split(".");
  parts[1] = (parts[1][0] === "a" ? "b" : "a") + parts[1].slice(1);
  assert.throws(() => decryptToken(parts.join(".")), /cannot be decrypted/);
  const calls = [];
  const client = createGitHub(async (url, options) => {
    calls.push({ url, options });
    if (url.includes("access_token"))
      return { access_token: accessToken, scope: "read:user" };
    if (url.endsWith("/user")) return { id: 123, login: "example-developer" };
    if (url.includes("/user/repos"))
      return [
        {
          id: 1,
          full_name: "example/commerce",
          private: false,
          default_branch: "main",
        },
        { id: 2, full_name: "https://bad.example/repo" },
      ];
    return null;
  });
  await client.exchange(
    {
      clientId: "client",
      clientSecret: "secret",
      callback: base + "/api/github/callback",
      scopes: ["read:user"],
    },
    "code",
    "verifier",
  );
  assert.equal(
    new URLSearchParams(calls[0].options.body).get("code_verifier"),
    "verifier",
  );
  assert.equal(calls[1].url, "https://api.github.com/user");
  const repos = await client.repositories(accessToken, 2);
  assert.equal(repos.repositories.length, 1);
  assert.match(calls[2].url, /page=2/);
});
