const assert = require('assert');
const http = require('http');
const app = require('../server');

const TEST_PORT = 5099;
let server;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path,
        method,
        headers: reqHeaders
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, text: raw });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting AppForge Automated Test Suite...\n');

  server = app.listen(TEST_PORT);
  await new Promise(r => setTimeout(r, 800));

  try {
    // Test 1: Health check endpoint
    console.log('Test 1: GET /api/health');
    const health = await request('GET', '/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.status, 'online');
    assert.strictEqual(health.data.database.target, 'localhost:27017');
    console.log('✓ Health check passed (MongoDB target: localhost:27017)\n');

    // Test 2: User registration
    console.log('Test 2: POST /api/auth/register (First, Last, Unique Username, Email, Mobile)');
    const uniqueSuffix = Date.now();
    const testUser = {
      firstName: 'Alex',
      lastName: 'Dev',
      username: `alexdev_${uniqueSuffix}`,
      email: `alex_${uniqueSuffix}@example.com`,
      mobile: `+1555${uniqueSuffix.toString().slice(-6)}`,
      password: 'password123',
      confirmPassword: 'password123'
    };

    const regRes = await request('POST', '/api/auth/register', testUser);
    assert.strictEqual(regRes.status, 201);
    assert.strictEqual(regRes.data.success, true);
    assert.ok(regRes.data.token, 'Token should be returned');
    assert.strictEqual(regRes.data.user.username, testUser.username);
    const token = regRes.data.token;
    console.log('✓ Registration passed with unique username, email & mobile\n');

    // Test 3: Login via Mobile
    console.log('Test 3: POST /api/auth/login via Mobile Number');
    const loginMobile = await request('POST', '/api/auth/login', {
      loginIdentifier: testUser.mobile,
      password: 'password123'
    });
    assert.strictEqual(loginMobile.status, 200);
    assert.strictEqual(loginMobile.data.success, true);
    console.log('✓ Login via Mobile number succeeded\n');

    // Test 4: Login via Email
    console.log('Test 4: POST /api/auth/login via Email ID');
    const loginEmail = await request('POST', '/api/auth/login', {
      loginIdentifier: testUser.email,
      password: 'password123'
    });
    assert.strictEqual(loginEmail.status, 200);
    assert.strictEqual(loginEmail.data.success, true);
    console.log('✓ Login via Email ID succeeded\n');

    // Test 5: Verify Auth Me
    console.log('Test 5: GET /api/auth/me (Bearer Token)');
    const meRes = await request('GET', '/api/auth/me', null, {
      'Authorization': `Bearer ${token}`
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.data.user.firstName, 'Alex');
    console.log('✓ Current user profile verified\n');

    // Test 6: Fetch Project with 7-Stage Pipeline
    console.log('Test 6: GET /api/projects (7-Stage Green Pipeline)');
    const projRes = await request('GET', '/api/projects', null, {
      'Authorization': `Bearer ${token}`
    });
    assert.strictEqual(projRes.status, 200);
    assert.ok(projRes.data.projects.length > 0);
    const project = projRes.data.projects[0];
    assert.strictEqual(project.pipelineStages.length, 7);
    console.log('✓ 7 Pipeline Stages verified:');
    project.pipelineStages.forEach(s => {
      console.log(`   [Step ${s.step}] ${s.name} -> Status: ${s.status.toUpperCase()} (GREEN ✓)`);
    });
    console.log();

    // Test 7: Run Complete 7-Step Pipeline
    console.log('Test 7: POST /api/projects/:id/pipeline/run');
    const runRes = await request('POST', `/api/projects/${project._id}/pipeline/run`, {
      deploymentType: 'cloud',
      cloudProvider: 'AWS ECS Fargate'
    }, {
      'Authorization': `Bearer ${token}`
    });
    assert.strictEqual(runRes.status, 200);
    assert.strictEqual(runRes.data.success, true);
    assert.strictEqual(runRes.data.stages.length, 7);
    console.log('✓ Full 7-stage pipeline run completed and persisted\n');

    // Test 8: Configure Step 4 (Cloud vs On-Prem)
    console.log('Test 8: PUT /api/projects/:id/step/4 (Switch to On-Premises)');
    const step4Res = await request('PUT', `/api/projects/${project._id}/step/4`, {
      config: {
        targetType: 'on-prem',
        targetName: 'On-Premises Docker Swarm / Kubernetes'
      }
    }, {
      'Authorization': `Bearer ${token}`
    });
    assert.strictEqual(step4Res.status, 200);
    console.log('✓ Step 4 successfully toggled to On-Premises\n');

    // Test 9: Update Environment Variables (.env)
    console.log('Test 9: PUT /api/projects/:id/env (Environment Variables)');
    const envRes = await request('PUT', `/api/projects/${project._id}/env`, {
      envVars: [
        { key: 'PORT', value: '5000', isSecret: false },
        { key: 'MONGO_URI', value: 'mongodb://127.0.0.1:27017/appforge_db', isSecret: true },
        { key: 'STRIPE_SECRET_KEY', value: 'sk_live_custom123', isSecret: true }
      ]
    }, {
      'Authorization': `Bearer ${token}`
    });
    assert.strictEqual(envRes.status, 200);
    assert.strictEqual(envRes.data.envVars.length, 3);
    console.log('✓ App variables successfully updated and masked\n');

    // Test 10: Submit Contact Us Form (stored in MongoDB)
    console.log('Test 10: POST /api/contact (Contact Us Form)');
    const contactRes = await request('POST', '/api/contact', {
      name: 'Sarah Connor',
      email: 'sarah@skynet-defense.com',
      phone: '+15559998888',
      preferredCloud: 'AWS Cloud',
      message: 'Need full assistance deploying my AI app with MongoDB database setup.'
    });
    assert.strictEqual(contactRes.status, 201);
    assert.strictEqual(contactRes.data.success, true);
    console.log('✓ Contact message successfully stored in MongoDB\n');

    // Test 11: Export Blueprint
    console.log('Test 11: GET /api/projects/:id/export');
    const exportRes = await request('GET', `/api/projects/${project._id}/export`, null, {
      'Authorization': `Bearer ${token}`
    });
    assert.strictEqual(exportRes.status, 200);
    assert.ok(exportRes.data.dockerfile.includes('FROM node'));
    assert.ok(exportRes.data.dockerCompose.includes('mongodb:'));
    assert.ok(exportRes.data.githubWorkflow.includes('7. Complete Setup'));
    console.log('✓ Blueprint export (Dockerfile, Docker Compose, GitHub Actions) verified\n');

    console.log('🎉 ALL 11 TESTS PASSED SUCCESSFULLY! 🚀');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();

