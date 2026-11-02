const { getCollection, ObjectId } = require('../config/db');

// Realistic 8-Stage Production DevOps & Engineering Pipeline Blueprint
const STAGES_BLUEPRINT = [
  {
    step: 1,
    id: 'architecture_scaffolding',
    name: '1. Architecture & Scaffolding',
    category: 'Architecture & Build',
    description: 'Stack selection, clean monorepo architecture, dependency resolution, and multi-stage production Docker containerization.',
    config: {
      stack: 'React 19 + Node.js Express / Next.js 15',
      bundler: 'Vite & esbuild',
      packageManager: 'npm v11',
      dockerfile: 'Multi-stage Alpine Linux (node:20-alpine)'
    }
  },
  {
    step: 2,
    id: 'api_integrations_setup',
    name: '2. Third-Party APIs Integration',
    category: 'Integrations & Webhooks',
    description: 'Connect third-party developer APIs including WhatsApp Cloud API, Stripe checkout, OpenAI LLMs, Twilio SMS, and transactional webhooks.',
    config: {
      thirdPartyAPIs: 'WhatsApp, Stripe, OpenAI, Twilio, SendGrid',
      whatsAppStatus: 'Ready to configure',
      stripeWebhook: 'Pending setup',
      aiProvider: 'Pending API Key'
    }
  },
  {
    step: 3,
    id: 'automated_testing',
    name: '3. Automated Test Matrix',
    category: 'Quality Assurance',
    description: 'Execute automated unit test suites, integration mock servers, and Playwright / Supertest API assertion contracts.',
    config: {
      testRunner: 'Vitest + Supertest',
      totalTests: 0,
      passed: 0,
      failed: 0,
      executionTime: '--'
    }
  },
  {
    step: 4,
    id: 'code_quality_sonar',
    name: '4. Static Code Quality & Sonar Gate',
    category: 'Code Quality',
    description: 'SonarQube static code analysis, ESLint standards, cyclomatic complexity auditing, and zero technical debt enforcement.',
    config: {
      sonarGrade: 'Pending Run',
      codeCoverage: '0%',
      codeSmells: 0,
      duplications: '0%',
      technicalDebt: '0 mins'
    }
  },
  {
    step: 5,
    id: 'security_audit_cve',
    name: '5. OWASP & Container Security Audit',
    category: 'Security Compliance',
    description: 'OWASP Top 10 vulnerability inspection, automated secret scanning, and container CVE vulnerability audits via Trivy.',
    config: {
      owaspCompliance: 'Pending Run',
      secretLeakScan: 'Not scanned',
      cveVulnerabilities: '0 Critical, 0 High',
      dependencyAudit: 'Pending'
    }
  },
  {
    step: 6,
    id: 'database_provisioning',
    name: '6. Database Provisioning & Migration',
    category: 'Data Layer',
    description: 'Provision localhost MongoDB database (localhost:27017) or Atlas replica set, apply collection indexes, and auto-seed initial data.',
    config: {
      engine: 'MongoDB Localhost (27017)',
      databaseName: 'devmatrix_db',
      collections: ['users', 'projects', 'contacts', 'logs'],
      indexes: 'Unique index on { username, email, mobile }',
      storageEngine: 'WiredTiger'
    }
  },
  {
    step: 7,
    id: 'cloud_onprem_deployment',
    name: '7. Cloud / On-Prem Deployment',
    category: 'Infrastructure Deployment',
    description: 'Rollout containerized application to Cloud Provider (AWS ECS / GCP Cloud Run) or On-Premises Docker Swarm / Kubernetes.',
    config: {
      targetType: 'cloud', // 'cloud' or 'on-prem'
      cloudProvider: 'AWS ECS Fargate & Cloud Run',
      onPremPlatform: 'Docker Swarm / Kubernetes Cluster',
      strategy: 'Zero-Downtime Blue/Green Rolling Update',
      replicas: 2
    }
  },
  {
    step: 8,
    id: 'zerotrust_network_live',
    name: '8. Zero-Trust Network & Live Production',
    category: 'Production Live & Monitoring',
    description: 'Auto-provision TLS 1.3 certificates, CORS origin protection, Cloudflare WAF, and 24/7 synthetic health monitoring.',
    config: {
      ssl: 'Let\'s Encrypt TLS 1.3 Ready',
      waf: 'Edge Shield & Rate Limiting (100 req/min)',
      healthCheck: 'HTTP GET /api/health',
      uptime: 'Ready'
    }
  }
];

// Clean stages generator (status: pending, empty logs, ready to run)
function createCleanStages() {
  return STAGES_BLUEPRINT.map(item => ({
    step: item.step,
    id: item.id,
    name: item.name,
    category: item.category,
    description: item.description,
    status: 'pending',
    timestamp: null,
    config: JSON.parse(JSON.stringify(item.config)),
    logs: []
  }));
}

// Clean environment variables for a new app
function createCleanEnvVars() {
  return [
    { key: 'PORT', value: '5000', isSecret: false, description: 'Application server HTTP port' },
    { key: 'NODE_ENV', value: 'development', isSecret: false, description: 'Runtime mode' },
    { key: 'MONGO_URI', value: 'mongodb://127.0.0.1:27017/devmatrix_db', isSecret: true, description: 'MongoDB localhost connection string' },
    { key: 'JWT_SECRET', value: '', isSecret: true, description: 'Token signature secret' },
    { key: 'WHATSAPP_TOKEN', value: '', isSecret: true, description: 'WhatsApp Cloud API Access Token' },
    { key: 'WHATSAPP_PHONE_ID', value: '', isSecret: false, description: 'WhatsApp Business Phone ID' },
    { key: 'STRIPE_SECRET_KEY', value: '', isSecret: true, description: 'Stripe payments secret' },
    { key: 'APP_URL', value: 'http://localhost:5000', isSecret: false, description: 'Application URL' }
  ];
}

// Clean integrations for a new app (all disabled by default, no fake tokens)
function createCleanIntegrations() {
  return [
    { id: 'whatsapp', name: 'WhatsApp Cloud API', category: 'Messaging & OTP', enabled: false, keyHint: 'Click to configure token', status: 'Not configured', badge: 'Popular' },
    { id: 'stripe', name: 'Stripe Payments', category: 'Payments', enabled: false, keyHint: 'Click to configure key', status: 'Not configured', badge: 'Billing' },
    { id: 'openai', name: 'OpenAI GPT-4o API', category: 'AI & Intelligence', enabled: false, keyHint: 'Click to configure key', status: 'Not configured', badge: 'AI' },
    { id: 'twilio', name: 'Twilio SMS & Voice', category: 'Communications', enabled: false, keyHint: 'Click to configure SID', status: 'Not configured', badge: 'SMS' },
    { id: 'github', name: 'GitHub CI/CD Actions', category: 'DevOps Automation', enabled: false, keyHint: 'Click to configure token', status: 'Not configured', badge: 'CI/CD' },
    { id: 'sendgrid', name: 'SendGrid / Resend', category: 'Transactional Email', enabled: false, keyHint: 'Click to configure key', status: 'Not configured', badge: 'Email' },
    { id: 'redis', name: 'Redis Cache (Localhost:6379)', category: 'Database & Cache', enabled: false, keyHint: '127.0.0.1:6379', status: 'Not configured', badge: 'Cache' },
    { id: 's3', name: 'AWS S3 / Cloudflare R2', category: 'Cloud Object Storage', enabled: false, keyHint: 'Click to configure bucket', status: 'Not configured', badge: 'Storage' },
    { id: 'auth0', name: 'Auth0 / Google SSO', category: 'Identity & SSO', enabled: false, keyHint: 'Click to configure domain', status: 'Not configured', badge: 'Auth' }
  ];
}

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

  // Create clean application without dummy or auto-completed data
  static async createDefault(userId, projectName = null) {
    let finalName = projectName;
    if (!finalName) {
      const existing = await this.findByUserId(userId);
      finalName = `APP-${existing.length + 1}`;
    }

    const newProject = {
      userId: userId.toString(),
      name: finalName,
      description: 'Fullstack application managed with DevMatrix 8-stage pipeline, API integrations, and MongoDB.',
      framework: 'React 19 + Express API',
      deploymentType: 'cloud', // 'cloud' or 'on-prem'
      cloudProvider: 'AWS ECS Fargate & Cloud Run',
      onPremPlatform: 'Docker Swarm / Kubernetes',
      pipelineStages: createCleanStages(),
      envVars: createCleanEnvVars(),
      integrations: createCleanIntegrations(),
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
  STAGES_BLUEPRINT,
  createCleanStages,
  createCleanEnvVars,
  createCleanIntegrations
};
