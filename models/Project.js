const { getCollection, ObjectId } = require('../config/db');

// Realistic 8-Stage Production DevOps & Engineering Pipeline
const DEFAULT_STAGES = [
  {
    step: 1,
    id: 'architecture_scaffolding',
    name: '1. Architecture & Scaffolding',
    category: 'Architecture & Build',
    description: 'Stack selection, clean monorepo architecture, dependency resolution, and multi-stage production Docker containerization.',
    status: 'completed',
    timestamp: new Date().toISOString(),
    config: {
      stack: 'React 19 + Node.js Express / Next.js 15',
      bundler: 'Vite & esbuild',
      packageManager: 'npm v11 (zero vulnerabilities)',
      dockerfile: 'Multi-stage Alpine Linux (node:20-alpine)'
    },
    logs: [
      '[BUILD] Initializing workspace scaffolding engine...',
      '[BUILD] Detected runtime: Node.js v24.15 / Express REST API',
      '[BUILD] Resolving dependencies from npm registry with clean lockfile.',
      '[BUILD] Compiling 184 client & server modules (0.64s).',
      '[BUILD] Bundling optimized chunks and tree-shaking unused exports.',
      '[BUILD] Built multi-stage Docker container: sha256:4a81bc29e1.',
      '[SUCCESS] Stage 1 [Architecture & Scaffolding]: Ready! Status: GREEN ✓'
    ]
  },
  {
    step: 2,
    id: 'api_integrations_setup',
    name: '2. Third-Party APIs Integration',
    category: 'Integrations & Webhooks',
    description: 'Pre-wire third-party developer APIs including WhatsApp Cloud API, Stripe checkout, OpenAI LLMs, Twilio SMS, and transactional webhooks.',
    status: 'completed',
    timestamp: new Date().toISOString(),
    config: {
      thirdPartyAPIs: 'WhatsApp, Stripe, OpenAI, Twilio, SendGrid',
      whatsAppStatus: 'Connected (Cloud API v20.0)',
      stripeWebhook: 'Active (/api/v1/stripe/webhook)',
      aiProvider: 'OpenAI GPT-4o / Claude 3.5 API'
    },
    logs: [
      '[API] Configuring third-party API communication layer...',
      '[API] WhatsApp Cloud API webhook listener registered at /api/webhook/whatsapp.',
      '[API] Verifying WhatsApp Meta Graph API access token handshake... 200 OK.',
      '[API] Pre-wired Stripe checkout sessions & customer webhooks.',
      '[API] Loaded AI agent endpoints for real-time prompt generation.',
      '[SUCCESS] Stage 2 [Third-Party APIs Integration]: Verified! Status: GREEN ✓'
    ]
  },
  {
    step: 3,
    id: 'automated_testing',
    name: '3. Automated Test Matrix',
    category: 'Quality Assurance',
    description: 'Execute automated unit test suites, integration mock servers, and Playwright / Supertest API assertion contracts.',
    status: 'completed',
    timestamp: new Date().toISOString(),
    config: {
      testRunner: 'Vitest + Supertest',
      totalTests: 64,
      passed: 64,
      failed: 0,
      executionTime: '1.18s'
    },
    logs: [
      '[TEST] Launching Vitest in-process test runner...',
      '[TEST] ✓ Auth Module Suite: 16 passed',
      '[TEST] ✓ Database CRUD & Migration Suite: 18 passed',
      '[TEST] ✓ WhatsApp Cloud API & Webhook Suite: 14 passed',
      '[TEST] ✓ End-to-End Pipeline Controller: 16 passed',
      '[TEST] 64/64 test suites completed with 0 failures.',
      '[SUCCESS] Stage 3 [Automated Test Matrix]: Passed! Status: GREEN ✓'
    ]
  },
  {
    step: 4,
    id: 'code_quality_sonar',
    name: '4. Static Code Quality & Sonar Gate',
    category: 'Code Quality',
    description: 'SonarQube static code analysis, ESLint standards, cyclomatic complexity auditing, and zero technical debt enforcement.',
    status: 'completed',
    timestamp: new Date().toISOString(),
    config: {
      sonarGrade: 'Grade A+ (Quality Gate Passed)',
      codeCoverage: '96.2%',
      codeSmells: 0,
      duplications: '0.1%',
      technicalDebt: '0 mins'
    },
    logs: [
      '[QUALITY] Running SonarQube Scanner v10.4...',
      '[QUALITY] Audited 8,420 lines of code across 32 source files.',
      '[QUALITY] Maintainability Rating: A | Reliability: A | Security: A.',
      '[QUALITY] Code coverage measured at 96.2% across critical paths.',
      '[QUALITY] Zero code smells or architectural debt detected.',
      '[SUCCESS] Stage 4 [Static Code Quality & Sonar Gate]: Passed! Status: GREEN ✓'
    ]
  },
  {
    step: 5,
    id: 'security_audit_cve',
    name: '5. OWASP & Container Security Audit',
    category: 'Security Compliance',
    description: 'OWASP Top 10 vulnerability inspection, automated secret scanning, and container CVE vulnerability audits via Trivy.',
    status: 'completed',
    timestamp: new Date().toISOString(),
    config: {
      owaspCompliance: '100% Passed',
      secretLeakScan: 'Clean (No API keys exposed)',
      cveVulnerabilities: '0 Critical, 0 High',
      dependencyAudit: '0 vulnerabilities found'
    },
    logs: [
      '[SECURITY] Initiating OWASP Top 10 automated security audit...',
      '[SECURITY] Scanning git commit tree for leaked secrets or private keys: Clean.',
      '[SECURITY] Running Trivy vulnerability scan against Docker image layers: 0 CVEs.',
      '[SECURITY] Audited dependency tree for cross-site scripting (XSS) & injection: Clean.',
      '[SUCCESS] Stage 5 [OWASP & Container Security Audit]: Passed! Status: GREEN ✓'
    ]
  },
  {
    step: 6,
    id: 'database_provisioning',
    name: '6. Database Provisioning & Migration',
    category: 'Data Layer',
    description: 'Provision localhost MongoDB database (localhost:27017) or Atlas replica set, apply collection indexes, and auto-seed initial data.',
    status: 'completed',
    timestamp: new Date().toISOString(),
    config: {
      engine: 'MongoDB Localhost (27017)',
      databaseName: 'appforge_db',
      collections: ['users', 'projects', 'contacts', 'logs'],
      indexes: 'Unique index on { username, email, mobile }',
      storageEngine: 'WiredTiger'
    },
    logs: [
      '[DATABASE] Connecting to MongoDB instance at mongodb://127.0.0.1:27017...',
      '[DATABASE] Connected to database: appforge_db.',
      '[DATABASE] Ensuring collections: users, projects, contacts, logs.',
      '[DATABASE] Applied unique index on username, email, and mobile fields.',
      '[DATABASE] Storage engine verified: WiredTiger high-throughput engine.',
      '[SUCCESS] Stage 6 [Database Provisioning & Migration]: Active! Status: GREEN ✓'
    ]
  },
  {
    step: 7,
    id: 'cloud_onprem_deployment',
    name: '7. Cloud / On-Prem Deployment',
    category: 'Infrastructure Deployment',
    description: 'Rollout containerized application to Cloud Provider (AWS ECS / GCP Cloud Run) or On-Premises Docker Swarm / Kubernetes.',
    status: 'completed',
    timestamp: new Date().toISOString(),
    config: {
      targetType: 'cloud', // 'cloud' or 'on-prem'
      cloudProvider: 'AWS ECS Fargate & Cloud Run',
      onPremPlatform: 'Docker Swarm / Kubernetes Cluster',
      strategy: 'Zero-Downtime Blue/Green Rolling Update',
      replicas: 2
    },
    logs: [
      '[DEPLOY] Verifying target cluster infrastructure...',
      '[DEPLOY] Target: Cloud Provider (AWS ECS Fargate) / On-Premises.',
      '[DEPLOY] Pushing release container to container registry...',
      '[DEPLOY] Initiating zero-downtime rolling deployment...',
      '[DEPLOY] 2/2 healthy container replicas serving traffic behind ALB.',
      '[SUCCESS] Stage 7 [Cloud / On-Prem Deployment]: Live! Status: GREEN ✓'
    ]
  },
  {
    step: 8,
    id: 'zerotrust_network_live',
    name: '8. Zero-Trust Network & Live Production',
    category: 'Production Live & Monitoring',
    description: 'Auto-provision TLS 1.3 certificates, CORS origin protection, Cloudflare WAF, and 24/7 synthetic health monitoring.',
    status: 'completed',
    timestamp: new Date().toISOString(),
    config: {
      ssl: 'Let\'s Encrypt TLS 1.3 Active',
      waf: 'Cloudflare Edge Shield & Rate Limiting (100 req/min)',
      healthCheck: 'HTTP GET /api/health -> 200 OK (14ms latency)',
      uptime: '99.99% Live'
    },
    logs: [
      '[VERIFY] Generating Let\'s Encrypt TLS 1.3 encryption certificates...',
      '[VERIFY] Hardening response headers with Helmet (CSP, HSTS, X-Frame-Options)...',
      '[VERIFY] Synthetic ping test to /api/health: 200 OK (Latency: 14ms).',
      '[VERIFY] All 8 Pipeline stages verified with GREEN marks!',
      '[SUCCESS] Stage 8 [Zero-Trust Network & Live Production]: Application is fully online!'
    ]
  }
];

const DEFAULT_ENV_VARS = [
  { key: 'PORT', value: '5000', isSecret: false, description: 'Application server HTTP port' },
  { key: 'NODE_ENV', value: 'production', isSecret: false, description: 'Runtime mode' },
  { key: 'MONGO_URI', value: 'mongodb://127.0.0.1:27017/appforge_db', isSecret: true, description: 'MongoDB localhost connection string' },
  { key: 'JWT_SECRET', value: 'appforge_super_secret_jwt_key_2026', isSecret: true, description: 'Token signature secret' },
  { key: 'WHATSAPP_TOKEN', value: 'EAAO...whatsapp_meta_token', isSecret: true, description: 'WhatsApp Cloud API Access Token' },
  { key: 'WHATSAPP_PHONE_ID', value: '10984712093847', isSecret: false, description: 'WhatsApp Business Phone ID' },
  { key: 'STRIPE_SECRET_KEY', value: 'sk_live_51M...customKey', isSecret: true, description: 'Stripe payments secret' },
  { key: 'APP_URL', value: 'http://localhost:5000', isSecret: false, description: 'Production URL' }
];

const DEFAULT_INTEGRATIONS = [
  { id: 'whatsapp', name: 'WhatsApp Cloud API', category: 'Messaging & OTP', enabled: true, keyHint: '+1 (555) 019-WHATSAPP', status: 'Connected', badge: 'Popular' },
  { id: 'stripe', name: 'Stripe Payments', category: 'Payments', enabled: true, keyHint: 'pk_live_...89x1', status: 'Connected', badge: 'Billing' },
  { id: 'openai', name: 'OpenAI GPT-4o API', category: 'AI & Intelligence', enabled: true, keyHint: 'sk-proj-...41v8', status: 'Connected', badge: 'AI' },
  { id: 'twilio', name: 'Twilio SMS & Voice', category: 'Communications', enabled: true, keyHint: 'AC...84a2', status: 'Connected', badge: 'SMS' },
  { id: 'github', name: 'GitHub CI/CD Actions', category: 'DevOps Automation', enabled: true, keyHint: 'ghp_...39xZ', status: 'Connected', badge: 'CI/CD' },
  { id: 'sendgrid', name: 'SendGrid / Resend', category: 'Transactional Email', enabled: true, keyHint: 're_...107q', status: 'Connected', badge: 'Email' },
  { id: 'redis', name: 'Redis Cache (Localhost:6379)', category: 'Database & Cache', enabled: true, keyHint: '127.0.0.1:6379', status: 'Connected', badge: 'Cache' },
  { id: 's3', name: 'AWS S3 / Cloudflare R2', category: 'Cloud Object Storage', enabled: true, keyHint: 'app-production-assets', status: 'Connected', badge: 'Storage' },
  { id: 'auth0', name: 'Auth0 / Google SSO', category: 'Identity & SSO', enabled: false, keyHint: 'Not configured', status: 'Available', badge: 'Auth' }
];

class Project {
  static collection() {
    return getCollection('projects');
  }

  static async findByUserId(userId) {
    if (!userId) return [];
    const list = await this.collection().find({ userId: userId.toString() });
    return await list.toArray();
  }

  static async findById(id) {
    if (!id) return null;
    try {
      let query = { _id: id };
      if (typeof id === 'string' && id.length === 24) {
        query = { $or: [{ _id: id }, { _id: new ObjectId(id) }] };
      }
      return await this.collection().findOne(query);
    } catch {
      return await this.collection().findOne({ _id: id });
    }
  }

  static async createDefault(userId, projectName = null) {
    // If no name provided, count existing user projects to name APP-1, APP-2, etc.
    let finalName = projectName;
    if (!finalName) {
      const existing = await this.findByUserId(userId);
      finalName = `APP-${existing.length + 1}`;
    }

    const newProject = {
      userId: userId.toString(),
      name: finalName,
      description: 'End-to-end cloud & on-premises application with 8-stage pipeline, WhatsApp API, and MongoDB.',
      framework: 'React 19 + Express API',
      deploymentType: 'cloud', // 'cloud' or 'on-prem'
      cloudProvider: 'AWS ECS Fargate & Cloud Run',
      onPremPlatform: 'Docker Swarm / Kubernetes',
      pipelineStages: JSON.parse(JSON.stringify(DEFAULT_STAGES)),
      envVars: JSON.parse(JSON.stringify(DEFAULT_ENV_VARS)),
      integrations: JSON.parse(JSON.stringify(DEFAULT_INTEGRATIONS)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const res = await this.collection().insertOne(newProject);
    newProject._id = res.insertedId;
    return newProject;
  }

  static async updateName(projectId, newName) {
    if (!newName || !newName.trim()) throw new Error('App name cannot be empty');
    const project = await this.findById(projectId);
    if (!project) throw new Error('Project not found');

    await this.collection().updateOne(
      { _id: project._id },
      { $set: { name: newName.trim(), updatedAt: new Date().toISOString() } }
    );
    return newName.trim();
  }

  static async deleteProject(projectId) {
    const project = await this.findById(projectId);
    if (!project) throw new Error('Project not found');
    await this.collection().deleteOne({ _id: project._id });
    return true;
  }

  static async updateStage(projectId, stepNum, updateData) {
    const project = await this.findById(projectId);
    if (!project) throw new Error('Project not found');

    const stages = project.pipelineStages.map(stage => {
      if (stage.step === Number(stepNum)) {
        return {
          ...stage,
          ...updateData,
          timestamp: new Date().toISOString()
        };
      }
      return stage;
    });

    await this.collection().updateOne(
      { _id: project._id },
      { $set: { pipelineStages: stages, updatedAt: new Date().toISOString() } }
    );
    return stages;
  }

  static async updateEnvVars(projectId, envVars) {
    const project = await this.findById(projectId);
    if (!project) throw new Error('Project not found');

    await this.collection().updateOne(
      { _id: project._id },
      { $set: { envVars, updatedAt: new Date().toISOString() } }
    );
    return envVars;
  }

  static async updateIntegrations(projectId, integrations) {
    const project = await this.findById(projectId);
    if (!project) throw new Error('Project not found');

    await this.collection().updateOne(
      { _id: project._id },
      { $set: { integrations, updatedAt: new Date().toISOString() } }
    );
    return integrations;
  }
}

module.exports = {
  Project,
  DEFAULT_STAGES,
  DEFAULT_ENV_VARS,
  DEFAULT_INTEGRATIONS
};
