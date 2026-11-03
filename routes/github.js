const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const { rateLimit } = require("express-rate-limit");
const { authMiddleware } = require("./auth");
const { JWT_SECRET } = require("../config/security");
const { getCollection } = require("../config/db");
const { Project } = require("../models/Project");
const {
  githubConfig,
  encryptToken,
  decryptToken,
  createGitHub,
} = require("../services/github");
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const connections = () => getCollection("github_connections");
const cookieName = "devmatrix_github_oauth";
const stateSecret = crypto
  .createHmac("sha256", JWT_SECRET)
  .update("devmatrix-github-oauth-state-v1")
  .digest("hex");
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/github/callback",
  maxAge: 10 * 60 * 1000,
});
function clearOAuthCookie(res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(cookieName, options);
}
function callbackCookie(req) {
  const item = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="));
  return item ? decodeURIComponent(item.slice(cookieName.length + 1)) : "";
}
function createGitHubRouter({ provider = createGitHub() } = {}) {
  const router = express.Router();
  router.get(
    "/callback",
    wrap(async (req, res) => {
      res.set("Cache-Control", "no-store");
      res.set("Referrer-Policy", "no-referrer");
      let state;
      try {
        state = jwt.verify(callbackCookie(req), stateSecret, {
          issuer: "devmatrix-github",
          audience: "github-oauth",
        });
        if (
          typeof req.query.state !== "string" ||
          typeof state.nonce !== "string" ||
          req.query.state.length !== state.nonce.length ||
          !crypto.timingSafeEqual(
            Buffer.from(req.query.state),
            Buffer.from(state.nonce),
          )
        )
          throw new Error("Invalid state");
      } catch {
        clearOAuthCookie(res);
        return res.redirect("/dashboard?github=error");
      }
      clearOAuthCookie(res);
      const redirect =
        "/dashboard?project=" +
        encodeURIComponent(state.projectId) +
        "&github=";
      if (req.query.error) return res.redirect(redirect + "cancelled");
      try {
        const config = githubConfig();
        if (
          !config ||
          typeof req.query.code !== "string" ||
          req.query.code.length > 2000
        )
          throw new Error();
        // The return target is still owned by the initiating platform account.
        const project = await Project.findById(state.projectId);
        if (!project || String(project.userId) !== state.userId)
          throw new Error();
        const data = await provider.exchange(
          config,
          req.query.code,
          state.verifier,
        );
        const connection = {
          _id: state.userId,
          login: data.login,
          githubId: data.githubId,
          scopes: data.scopes,
          encryptedToken: encryptToken(data.token),
          updatedAt: new Date().toISOString(),
        };
        if (await connections().findOne({ _id: state.userId }))
          await connections().updateOne(
            { _id: state.userId },
            {
              $set: {
                login: connection.login,
                githubId: connection.githubId,
                scopes: connection.scopes,
                encryptedToken: connection.encryptedToken,
                updatedAt: connection.updatedAt,
              },
            },
          );
        else await connections().insertOne(connection);
        res.redirect(redirect + "connected");
      } catch {
        res.redirect(redirect + "error");
      }
    }),
  );
  router.use(authMiddleware);
  router.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 30,
      keyGenerator: (req) => req.user.userId,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: {
        success: false,
        error: "Please wait before making more GitHub requests.",
      },
    }),
  );
  router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get(
    "/status",
    wrap(async (req, res) => {
      const config = githubConfig(),
        connection = await connections().findOne({ _id: req.user.userId });
      res.json({
        success: true,
        configured: Boolean(config),
        connected: Boolean(connection),
        login: connection?.login || null,
        scopes: connection?.scopes || [],
        requestedScopes: config?.scopes || [],
      });
    }),
  );
  router.post(
    "/authorize",
    wrap(async (req, res) => {
      const config = githubConfig();
      if (!config)
        return res.status(409).json({
          success: false,
          error:
            "The operator must configure GitHub OAuth before you can connect.",
        });
      const project = await Project.findById(req.body.projectId);
      if (!project || String(project.userId) !== req.user.userId)
        return res
          .status(404)
          .json({ success: false, error: "Application not found" });
      const nonce = crypto.randomBytes(32).toString("base64url"),
        verifier = crypto.randomBytes(32).toString("base64url");
      const state = jwt.sign(
        {
          userId: req.user.userId,
          projectId: String(project._id),
          nonce,
          verifier,
        },
        stateSecret,
        {
          issuer: "devmatrix-github",
          audience: "github-oauth",
          expiresIn: "10m",
        },
      );
      res.cookie(cookieName, state, cookieOptions());
      const url = new URL("https://github.com/login/oauth/authorize");
      for (const [key, value] of Object.entries({
        client_id: config.clientId,
        redirect_uri: config.callback,
        scope: config.scopes.join(" "),
        state: nonce,
        code_challenge: crypto
          .createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }))
        url.searchParams.set(key, value);
      res.json({ success: true, url: url.toString() });
    }),
  );
  router.get(
    "/repositories",
    wrap(async (req, res) => {
      const page = Number(req.query.page || 1);
      if (!Number.isInteger(page) || page < 1 || page > 100)
        return res
          .status(400)
          .json({ success: false, error: "Invalid repository page" });
      const connection = await connections().findOne({ _id: req.user.userId });
      if (!connection)
        return res.status(409).json({
          success: false,
          error: "Connect your GitHub account first.",
        });
      try {
        res.json({
          success: true,
          ...(await provider.repositories(
            decryptToken(connection.encryptedToken),
            page,
          )),
          page,
        });
      } catch (error) {
        res.status(409).json({
          success: false,
          error:
            error.status === 409
              ? error.message
              : "GitHub could not list repositories. Check permissions, organization approval, or API limits; reconnect if access was revoked.",
        });
      }
    }),
  );
  router.delete(
    "/connection",
    wrap(async (req, res) => {
      const connection = await connections().findOne({ _id: req.user.userId });
      await connections().deleteOne({ _id: req.user.userId });
      let revokeRequired = false;
      if (connection) {
        try {
          const config = githubConfig();
          if (!config) throw new Error();
          await provider.revoke(
            config,
            decryptToken(connection.encryptedToken),
          );
        } catch {
          revokeRequired = true;
        }
      }
      res.json({ success: true, connected: false, revokeRequired });
    }),
  );
  return router;
}
module.exports = { createGitHubRouter };
