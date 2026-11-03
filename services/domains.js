const dns = require("node:dns").promises;
const tls = require("node:tls");
const { domainToASCII } = require("node:url");
const { randomBytes } = require("node:crypto");
const ipaddr = require("ipaddr.js");
function domainName(value) {
  if (
    typeof value !== "string" ||
    value.length > 253 ||
    /[:/@\s?#]/.test(value)
  )
    throw Object.assign(
      new Error(
        "Enter a domain only, such as app.example.com, without a URL, port, or path.",
      ),
      { status: 400 },
    );
  const name = domainToASCII(value.toLowerCase().replace(/\.$/, ""));
  if (
    !name ||
    ipaddr.isValid(name) ||
    name.split(".").length < 2 ||
    name.split(".").some((l) => !/^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(l)) ||
    /\.(local|internal|localhost|invalid|test|onion)$/.test(name)
  )
    throw Object.assign(new Error("Use a valid public domain name."), {
      status: 400,
    });
  return name;
}
function publicAddress(address) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
function challenge(name) {
  return {
    name,
    token: randomBytes(24).toString("hex"),
    createdAt: new Date().toISOString(),
  };
}
async function resolveOrEmpty(resolve, name) {
  try {
    return await resolve(name);
  } catch (error) {
    if (["ENODATA", "ENOTFOUND", "ENONAME", "NXDOMAIN"].includes(error.code))
      return [];
    throw error;
  }
}
function inspectCertificate(name, address) {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: address,
      port: 443,
      servername: name,
      rejectUnauthorized: true,
    });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(5000, () =>
      finish({ status: "unreachable", message: "TLS connection timed out." }),
    );
    socket.once("secureConnect", () => {
      const cert = socket.getPeerCertificate();
      const expiresAt = new Date(cert.valid_to);
      if (!socket.authorized || !Number.isFinite(expiresAt.getTime()))
        return finish({
          status: "invalid",
          message: "Certificate validation failed.",
        });
      const daysRemaining = Math.floor((expiresAt - Date.now()) / 86400000);
      finish({
        status: daysRemaining <= 14 ? "expiring" : "valid",
        expiresAt: expiresAt.toISOString(),
        daysRemaining,
        issuer: cert.issuer?.O || cert.issuer?.CN || "",
        message: "Trusted certificate matches this hostname.",
      });
    });
    socket.once("error", (error) =>
      finish({
        status: [
          "CERT_HAS_EXPIRED",
          "ERR_TLS_CERT_ALTNAME_INVALID",
          "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
          "DEPTH_ZERO_SELF_SIGNED_CERT",
          "CERT_NOT_YET_VALID",
          "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
        ].includes(error.code)
          ? "invalid"
          : "unreachable",
        message:
          "TLS validation did not succeed (" +
          (error.code || "CONNECTION_FAILED") +
          ").",
      }),
    );
  });
}
function createDomainChecker(resolver = dns, inspect = inspectCertificate) {
  return async (domain, target) => {
    const name = domainName(domain.name);
    let timer;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("DNS lookup timed out")), 7000);
      timer.unref?.();
    });
    const [v4, v6, cnames, txt] = await Promise.race([
      Promise.all([
        resolveOrEmpty(resolver.resolve4.bind(resolver), name),
        resolveOrEmpty(resolver.resolve6.bind(resolver), name),
        resolveOrEmpty(resolver.resolveCname.bind(resolver), name),
        resolveOrEmpty(
          resolver.resolveTxt.bind(resolver),
          "_devmatrix-challenge." + name,
        ),
      ]),
      timeout,
    ]).finally(() => clearTimeout(timer));
    const records = {
      A: v4,
      AAAA: v6,
      CNAME: cnames.map((s) => s.toLowerCase().replace(/\.$/, "")),
    };
    const ownershipVerified = txt.some(
      (parts) => parts.join("") === "devmatrix-verification=" + domain.token,
    );
    const addresses = [...v4, ...v6];
    const safe = addresses.length > 0 && addresses.every(publicAddress);
    const expected = (target?.dnsRecords || []).map((record) => {
      if (
        !record ||
        !["A", "AAAA", "CNAME"].includes(record.type) ||
        typeof record.value !== "string" ||
        record.value.length > 253
      )
        throw Object.assign(
          new Error("The operator must correct the expected DNS records."),
          { status: 409 },
        );
      return {
        type: record.type,
        value: record.value.toLowerCase().replace(/\.$/, ""),
        matched: (records[record.type] || [])
          .map((s) => s.toLowerCase())
          .includes(record.value.toLowerCase().replace(/\.$/, "")),
      };
    });
    let certificate = {
      status: "pending_ownership",
      message: "Publish the TXT record before certificate inspection.",
    };
    if (ownershipVerified)
      certificate = safe
        ? await inspect(name, addresses[0])
        : {
            status: "blocked",
            message: "The domain must resolve exclusively to public addresses.",
          };
    return {
      checkedAt: new Date().toISOString(),
      name,
      ownershipVerified,
      records,
      expected,
      mappingStatus: !ownershipVerified
        ? "pending_ownership"
        : !safe
          ? "blocked"
          : !expected.length
            ? "expected_records_not_configured"
            : expected.every((r) => r.matched)
              ? "matches"
              : "mismatch",
      certificate,
    };
  };
}
module.exports = {
  domainName,
  publicAddress,
  challenge,
  createDomainChecker,
  inspectCertificate,
};
