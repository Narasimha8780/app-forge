require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const path = require("node:path");
const { connectDB, getStatus, pingDB, closeDB } = require("./config/db");
const app = express();
app.disable("x-powered-by");
// Cloud Run is behind one trusted ingress proxy. Override only for a known topology.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
  }),
);
const origins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      cb(null, !origin || origins.includes(origin));
    },
  }),
);
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use(
  "/api/auth",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      success: false,
      error: "Too many sign-in attempts. Try again in 15 minutes.",
    },
  }),
);
app.use(
  "/api/contact",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    message: { success: false, error: "Please try again later." },
  }),
);
app.use("/api/auth", require("./routes/auth").router);
app.use("/api/projects", require("./routes/projects"));
app.use("/api/contact", require("./routes/contact"));
app.get("/api/health", async (req, res) => {
  try {
    await pingDB();
    res.json({
      status: "online",
      appName: "DevMatrix Studio",
      version: "2.0.0",
      uptime: `${Math.floor(process.uptime())}s`,
      database: getStatus(),
    });
  } catch {
    res
      .status(503)
      .json({
        status: "unavailable",
        database: { engine: getStatus().engine, connected: false },
      });
  }
});
app.use(express.static(path.join(__dirname, "public")));
for (const page of ["auth", "dashboard"])
  app.get("/" + page, (req, res) =>
    res.sendFile(path.join(__dirname, "public", page + ".html")),
  );
app.use("/api", (req, res) =>
  res.status(404).json({ success: false, error: "Endpoint not found" }),
);
app.use((req, res) =>
  res.status(404).send("Page not found. Return to / to continue."),
);
app.use((err, req, res, next) => {
  const status =
    err.status ||
    (err.code === 11000 || err.code === "23505" || err.code === "ER_DUP_ENTRY"
      ? 409
      : 500);
  if (status >= 500) console.error("[Request error]", err.name);
  res
    .status(status)
    .json({
      success: false,
      error:
        status >= 500 ? "Something went wrong. Please try again." : err.message,
    });
});
async function startServer(port = process.env.PORT || 5000) {
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
  )
    throw new Error(
      "Set JWT_SECRET to a random secret of at least 32 characters",
    );
  await connectDB();
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, "0.0.0.0", () => resolve(s));
    s.on("error", reject);
  });
  console.log(
    `DevMatrix Studio listening on port ${server.address().port}; database: ${getStatus().engine}`,
  );
  return server;
}
if (require.main === module) {
  let server;
  startServer()
    .then((s) => {
      server = s;
    })
    .catch(async (err) => {
      console.error(
        "Startup failed:",
        err.message.replace(/:\/\/[^ ]+/g, "://[redacted]"),
      );
      await closeDB().catch(() => {});
      process.exit(1);
    });
  const shutdown = () => {
    const timer = setTimeout(() => process.exit(1), 9000);
    timer.unref();
    if (server)
      server.close(async () => {
        await closeDB();
        process.exit(0);
      });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
module.exports = { app, startServer };
