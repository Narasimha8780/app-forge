const crypto = require("node:crypto");
const { JWT_SECRET } = require("../config/security");
const error = (message, status = 409) =>
  Object.assign(new Error(message), { status });
function githubConfig() {
  if (
    !process.env.APP_BASE_URL ||
    !process.env.GITHUB_CLIENT_ID ||
    !process.env.GITHUB_CLIENT_SECRET
  )
    return null;
  let base;
  try {
    base = new URL(process.env.APP_BASE_URL);
  } catch {
    throw error("The operator must correct APP_BASE_URL.");
  }
  const local =
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1"].includes(base.hostname);
  if (
    (base.protocol !== "https:" && !(local && base.protocol === "http:")) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw error(
      "APP_BASE_URL must be the public HTTPS origin of this application.",
    );
  const scopes = [
    ...new Set(
      (process.env.GITHUB_OAUTH_SCOPE || "read:user")
        .split(/[ ,]+/)
        .filter(Boolean),
    ),
  ];
  if (!scopes.every((scope) => ["read:user", "repo"].includes(scope)))
    throw error("Supported GitHub scopes are read:user and optional repo.");
  return {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callback: base.origin + "/api/github/callback",
    scopes,
  };
}
function key() {
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      JWT_SECRET,
      "devmatrix-github-v1",
      "oauth-access-token",
      32,
    ),
  );
}
function encryptToken(token) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body]
    .map((buffer) => buffer.toString("base64url"))
    .join(".");
}
function decryptToken(value) {
  try {
    const parts = value.split(".").map((s) => Buffer.from(s, "base64url"));
    if (parts.length !== 3 || parts[0].length !== 12 || parts[1].length !== 16)
      throw new Error();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), parts[0]);
    decipher.setAuthTag(parts[1]);
    return Buffer.concat([
      decipher.update(parts[2]),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw error(
      "GitHub connection cannot be decrypted. Disconnect and reconnect GitHub.",
    );
  }
}
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Object.assign(new Error("GitHub request failed"), {
      providerStatus: response.status,
    });
  return response.status === 204 ? null : response.json();
}
function createGitHub(transport = request) {
  const headers = (token) => ({
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + token,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "DevMatrix-Studio",
  });
  return {
    async exchange(config, code, verifier) {
      const data = await transport(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            redirect_uri: config.callback,
            code_verifier: verifier,
          }).toString(),
        },
      );
      if (
        typeof data.access_token !== "string" ||
        data.error ||
        data.access_token.length > 4000
      )
        throw error(
          "GitHub authorization was not completed. Please reconnect.",
        );
      const profile = await transport("https://api.github.com/user", {
        headers: headers(data.access_token),
      });
      if (
        !Number.isSafeInteger(profile.id) ||
        typeof profile.login !== "string"
      )
        throw error("GitHub returned an invalid profile.");
      return {
        token: data.access_token,
        githubId: profile.id,
        login: profile.login,
        scopes:
          typeof data.scope === "string"
            ? data.scope.split(/[ ,]+/).filter(Boolean)
            : config.scopes,
      };
    },
    async repositories(token, page) {
      const data = await transport(
        `https://api.github.com/user/repos?per_page=50&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
        { headers: headers(token) },
      );
      if (!Array.isArray(data))
        throw error("GitHub returned an invalid repository list.");
      return {
        repositories: data
          .filter(
            (repo) =>
              typeof repo.full_name === "string" &&
              /^[\w.-]+\/[\w.-]+$/.test(repo.full_name),
          )
          .map((repo) => ({
            id: repo.id,
            fullName: repo.full_name,
            url: "https://github.com/" + repo.full_name,
            private: Boolean(repo.private),
            defaultBranch: repo.default_branch || "main",
            archived: Boolean(repo.archived),
          })),
        hasMore: data.length === 50,
      };
    },
    async revoke(config, token) {
      return transport(
        `https://api.github.com/applications/${encodeURIComponent(config.clientId)}/token`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization:
              "Basic " +
              Buffer.from(config.clientId + ":" + config.clientSecret).toString(
                "base64",
              ),
            "Content-Type": "application/json",
            "User-Agent": "DevMatrix-Studio",
          },
          body: JSON.stringify({ access_token: token }),
        },
      );
    },
  };
}
module.exports = { githubConfig, encryptToken, decryptToken, createGitHub };
