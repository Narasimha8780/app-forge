const { GoogleAuth } = require("google-auth-library");
const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const activeStatuses = new Set([
  "QUEUED",
  "PENDING",
  "WORKING",
  "STATUS_UNKNOWN",
]);
const terminalStatuses = new Set([
  "SUCCESS",
  "FAILURE",
  "INTERNAL_ERROR",
  "TIMEOUT",
  "CANCELLED",
  "EXPIRED",
]);
const configError = (message) =>
  Object.assign(new Error(message), { status: 409 });
function targetFor(project) {
  let config;
  try {
    config = JSON.parse(process.env.DEPLOYMENT_TARGETS_JSON || "{}");
  } catch {
    throw configError("The operator must correct DEPLOYMENT_TARGETS_JSON.");
  }
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw configError(
      "The operator must configure a JSON object in DEPLOYMENT_TARGETS_JSON.",
    );
  const target = Object.hasOwn(config, String(project._id))
    ? config[String(project._id)]
    : null;
  if (!target) return null;
  if (
    !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(target.googleProject || "") ||
    !/^(global|[a-z]+-[a-z]+\d)$/.test(target.region || "") ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(target.triggerId || "") ||
    !/^[\w.-]+\/[\w.-]+$/.test(target.repository || "") ||
    !/^[\w./-]{1,200}$/.test(target.branch || "") ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(target.serviceName || "") ||
    !Array.isArray(target.dnsRecords || [])
  )
    throw configError(
      "The operator must correct this project’s deployment target.",
    );
  const repository = (project.brief?.repositoryUrl || "")
    .replace(/^https:\/\/github.com\//, "")
    .replace(/\/?$/, "")
    .replace(/\.git$/, "");
  if (repository.toLowerCase() !== target.repository.toLowerCase())
    throw configError(
      "The saved brief repository does not match the approved deployment target.",
    );
  return {
    googleProject: target.googleProject,
    region: target.region,
    triggerId: target.triggerId,
    repository: target.repository,
    branch: target.branch,
    serviceName: target.serviceName,
    dnsRecords: target.dnsRecords || [],
  };
}
function publicTarget(target) {
  if (!target) return null;
  return { ...target };
}
function sameTarget(a, b) {
  return [
    "googleProject",
    "region",
    "triggerId",
    "repository",
    "branch",
    "serviceName",
  ].every((k) => a?.[k] === b?.[k]);
}
async function googleRequest(options) {
  let client;
  try {
    client = await auth.getClient();
  } catch (error) {
    error.notSubmitted = true;
    throw error;
  }
  // Never automatically retry trigger submissions: an ambiguous timeout may have started a build.
  const response = await client.request({
    ...options,
    timeout: 15000,
    retry: false,
  });
  return response.data;
}
function createCloudBuild(request = googleRequest) {
  const root = (target) =>
    `projects/${target.googleProject}/locations/${target.region}`;
  return {
    async start(target) {
      const operation = await request({
        url: `https://cloudbuild.googleapis.com/v1/${root(target)}/triggers/${target.triggerId}:run`,
        method: "POST",
        data: {
          projectId: target.googleProject,
          triggerId: target.triggerId,
          source: { branchName: target.branch },
        },
      });
      if (
        !operation.name?.startsWith(root(target) + "/operations/") ||
        !/^[\w/.-]+$/.test(operation.name)
      )
        throw new Error("Invalid Cloud Build operation response");
      return {
        operationName: operation.name,
        ...buildState(operation.metadata?.build),
        ...(operation.done && operation.error ? { status: "FAILURE" } : {}),
      };
    },
    async status(target, job) {
      if (job.buildId) {
        if (!/^[\w-]{1,100}$/.test(job.buildId))
          throw new Error("Invalid build identifier");
        return buildState(
          await request({
            url: `https://cloudbuild.googleapis.com/v1/${root(target)}/builds/${job.buildId}`,
            method: "GET",
          }),
        );
      }
      if (
        !job.operationName?.startsWith(root(target) + "/operations/") ||
        !/^[\w/.-]+$/.test(job.operationName)
      )
        throw new Error("Invalid operation identifier");
      const operation = await request({
        url: `https://cloudbuild.googleapis.com/v1/${job.operationName}`,
        method: "GET",
      });
      const state = buildState(operation.response || operation.metadata?.build);
      return operation.done && operation.error
        ? { ...state, status: "FAILURE" }
        : state;
    },
    async logs(target, job, kind = "build") {
      if (kind === "build" && !job.buildId) return { lines: [], pending: true };
      const filter =
        kind === "runtime"
          ? `resource.type="cloud_run_revision" AND resource.labels.service_name="${target.serviceName}" AND resource.labels.location="${target.region}" AND timestamp>="${job.createdAt}"`
          : `resource.type="build" AND resource.labels.build_id="${job.buildId}"`;
      const response = await request({
        url: "https://logging.googleapis.com/v2/entries:list",
        method: "POST",
        data: {
          resourceNames: [`projects/${target.googleProject}`],
          filter,
          orderBy: "timestamp desc",
          pageSize: 100,
        },
      });
      return {
        lines: (response.entries || []).reverse().map((entry) => ({
          timestamp: entry.timestamp || "",
          severity: entry.severity || "DEFAULT",
          message: redact(
            entry.textPayload ||
              entry.jsonPayload?.message ||
              JSON.stringify(entry.jsonPayload || {}),
          ),
        })),
        truncated: Boolean(response.nextPageToken),
        source: kind,
      };
    },
  };
}
function redact(value) {
  return String(value)
    .slice(0, 12000)
    .replace(/(Bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/([a-z]+:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
    .replace(
      /((?:password|token|secret|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[redacted]",
    );
}
function buildState(build) {
  const status = [...activeStatuses, ...terminalStatuses].includes(
    build?.status,
  )
    ? build.status
    : "PENDING";
  return {
    status,
    ...(typeof build?.id === "string" && /^[\w-]{1,100}$/.test(build.id)
      ? { buildId: build.id }
      : {}),
    ...(build?.logUrl?.startsWith("https://console.cloud.google.com/")
      ? { logUrl: build.logUrl }
      : {}),
    ...(build?.finishTime ? { finishedAt: build.finishTime } : {}),
    ...(build?.sourceProvenance?.resolvedRepoSource?.commitSha
      ? { commitSha: build.sourceProvenance.resolvedRepoSource.commitSha }
      : {}),
  };
}
module.exports = {
  createCloudBuild,
  targetFor,
  publicTarget,
  sameTarget,
  activeStatuses,
  terminalStatuses,
  redact,
};
