// Shared across JWT sessions and encrypted GitHub credentials. Production requires
// the stable Secret Manager value validated by server startup.
const JWT_SECRET =
  process.env.JWT_SECRET ||
  require("node:crypto").randomBytes(48).toString("hex");
module.exports = { JWT_SECRET };
