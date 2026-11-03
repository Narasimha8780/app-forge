const STACKS = {
  node: {
    label: "Node.js · Express",
    runtime: "Node.js 24",
    build: "npm ci",
    test: "npm test",
    start: "npm start",
  },
  java: {
    label: "Java · Spring Boot",
    runtime: "Java 21",
    build: "./mvnw -B package -DskipTests",
    test: "./mvnw -B test",
    start: "java -jar app.jar",
  },
  python: {
    label: "Python · FastAPI",
    runtime: "Python 3.12",
    build: "pip install -r requirements.txt",
    test: "pytest",
    start: "uvicorn main:app --host 0.0.0.0 --port $PORT",
  },
};
const DATABASES = {
  mongodb: "MongoDB",
  postgres: "PostgreSQL",
  mysql: "MySQL",
  none: "No database",
};
const STAGES = [
  [
    "architecture_scaffolding",
    "Define & design",
    "Agree on the problem before writing code.",
    [
      "Confirm audience, scope, and acceptance criteria",
      "Review architecture and repository layout",
    ],
    "Approved brief or architecture document",
  ],
  [
    "api_integrations_setup",
    "Build & integrate",
    "Implement a usable vertical slice of your application.",
    [
      "Implement core screens and API contracts",
      "Configure only the integrations your product needs",
    ],
    "Commit or pull request with implementation notes",
  ],
  [
    "automated_testing",
    "Test the behavior",
    "Prove the important user journeys work.",
    [
      "Run unit and integration tests in CI",
      "Test failures, permissions, and critical user journeys",
    ],
    "CI test report with passed and failed counts",
  ],
  [
    "code_quality_sonar",
    "Review code quality",
    "Keep changes understandable and maintainable.",
    [
      "Run stack-specific lint and static analysis",
      "Review changes and resolve blocking findings",
    ],
    "Code review or static analysis report",
  ],
  [
    "security_audit_cve",
    "Check security",
    "Review application and dependency risks.",
    [
      "Scan dependencies, container, and committed secrets",
      "Review authentication, authorization, and remaining risks",
    ],
    "Security report and documented risk decisions",
  ],
  [
    "database_provisioning",
    "Prepare data",
    "Make persistence and recovery deliberate.",
    [
      "Configure MongoDB, PostgreSQL, or MySQL with least privilege",
      "Apply migrations and test backup restoration; document N/A if stateless",
    ],
    "Migration and restore report, or stateless rationale",
  ],
  [
    "cloud_onprem_deployment",
    "Release to staging",
    "Ship an immutable artifact and rehearse rollback.",
    [
      "Build and deploy to staging using your CI provider",
      "Review runtime secrets, release revision, and rollback plan",
    ],
    "Build record and staging release URL",
  ],
  [
    "zerotrust_network_live",
    "Launch & operate",
    "Approve production with observable evidence.",
    [
      "Approve release and verify the production health endpoint",
      "Record monitoring, support ownership, and rollback instructions",
    ],
    "Production URL and operational handover document",
  ],
];
function createCleanStages() {
  return STAGES.map(([id, name, description, checklist, deliverable], i) => ({
    step: i + 1,
    id,
    name,
    description,
    checklist,
    deliverable,
    category:
      i < 2 ? "Plan & build" : i < 5 ? "Quality gates" : "Release & operate",
    status: "pending",
    evidence: null,
    logs: [],
    timestamp: null,
  }));
}
function readiness(project) {
  const b = project.brief || {};
  const checks = [
    [
      "Goal",
      (b.goal || "").length >= 20,
      "Describe the problem and desired outcome (20+ characters).",
    ],
    ["Audience", Boolean(b.audience), "Tell us who will use this application."],
    [
      "Acceptance criteria",
      (b.acceptanceCriteria || "").length >= 20,
      "List measurable outcomes for the first release (20+ characters).",
    ],
    [
      "Repository",
      Boolean(b.repositoryUrl),
      "Add an HTTPS GitHub repository URL.",
    ],
    [
      "Release owner",
      Boolean(b.owner),
      "Name the person accountable for the release.",
    ],
    [
      "Stack",
      Object.hasOwn(STACKS, project.stack),
      "Choose Node.js, Java, or Python.",
    ],
    [
      "Database",
      Object.hasOwn(DATABASES, project.database),
      "Choose a database or explicitly choose none.",
    ],
  ].map(([name, passed, action]) => ({ name, passed, action }));
  return {
    ready: checks.every((c) => c.passed),
    checks,
    nextStep:
      (project.pipelineStages || []).find((s) => s.status !== "completed")
        ?.step || null,
  };
}
function httpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
function validateBrief(input) {
  const result = {};
  for (const key of [
    "goal",
    "audience",
    "acceptanceCriteria",
    "repositoryUrl",
    "owner",
    "notes",
    "cloud",
    "region",
    "domain",
    "requirements",
  ]) {
    if (
      typeof (input[key] ?? "") !== "string" ||
      (input[key] || "").length > 4000
    )
      throw Object.assign(new Error("Invalid brief field: " + key), {
        status: 400,
      });
    result[key] = (input[key] || "").trim();
  }
  if (result.cloud && !['gcp', 'aws', 'azure'].includes(result.cloud))
    throw Object.assign(new Error('Choose GCP, AWS or Azure'), { status: 400 });
  if (result.domain && (result.domain.length > 253 || !/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(result.domain)))
    throw Object.assign(new Error('Enter a domain name without a URL, path or credentials'), { status: 400 });
  if (
    result.repositoryUrl &&
    (!httpUrl(result.repositoryUrl) ||
      new URL(result.repositoryUrl).hostname !== "github.com" ||
      !/^\/[\w.-]+\/[\w.-]+\/?$/.test(new URL(result.repositoryUrl).pathname))
  )
    throw Object.assign(
      new Error("Use an HTTPS GitHub repository URL without credentials"),
      { status: 400 },
    );
  return result;
}
module.exports = {
  STACKS,
  DATABASES,
  STAGES,
  createCleanStages,
  readiness,
  httpUrl,
  validateBrief,
};
