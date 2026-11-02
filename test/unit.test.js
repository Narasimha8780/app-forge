const assert = require('assert');
const User = require('../models/User');
const { Project } = require('../models/Project');
const Contact = require('../models/Contact');
const { getStatus } = require('../config/db');

async function runUnitTests() {
  console.log('🧪 Starting DevMatrix Enhanced In-Process Test Suite...\n');

  try {
    // 1. Test Database Status
    console.log('Test 1: Verify Database Configuration & Fallback Engine');
    const dbStatus = getStatus();
    assert.strictEqual(dbStatus.uri, 'mongodb://127.0.0.1:27017/devmatrix_db');
    console.log('✓ Database target verified: localhost:27017 (devmatrix_db)\n');

    // 2. Test User Creation with Required Fields
    console.log('Test 2: Create User with First, Last, Unique Username, Email & Mobile');
    const uniqueSuffix = Date.now();
    const userData = {
      firstName: 'Tony',
      lastName: 'Stark',
      username: `ironman_${uniqueSuffix}`,
      email: `tony_${uniqueSuffix}@starkindustries.com`,
      mobile: `+1917${uniqueSuffix.toString().slice(-7)}`,
      password: 'arcReactorSecure2026'
    };

    const user = await User.create(userData);
    assert.ok(user._id, 'User must have an ID');
    assert.strictEqual(user.firstName, 'Tony');
    assert.strictEqual(user.lastName, 'Stark');
    assert.strictEqual(user.username, userData.username);
    assert.strictEqual(user.email, userData.email);
    assert.strictEqual(user.mobile, userData.mobile);
    console.log('✓ User created successfully with all required credentials\n');

    // 3. Test Multi-App Creation (First app based on username)
    console.log('Test 3: First App Created Based on Username & Multiple Apps');
    const firstAppName = `${user.username}-app`;
    const app1 = await Project.createDefault(user._id, firstAppName);
    assert.ok(app1._id);
    assert.strictEqual(app1.name, firstAppName);

    const app2 = await Project.createDefault(user._id, `${user.username}-service-2`);
    assert.ok(app2._id);
    assert.strictEqual(app2.name, `${user.username}-service-2`);

    const userApps = await Project.findByUserId(user._id);
    assert.strictEqual(userApps.length, 2, 'User should have 2 apps created');
    console.log(`✓ First app created based on username (${firstAppName}) & multi-app verified\n`);

    // 4. Test Modifying App Name (Rename)
    console.log('Test 4: Modify App Name (Rename to Storefront API)');
    const renamed = await Project.updateName(app1._id, 'Storefront API');
    assert.strictEqual(renamed, 'Storefront API');
    const app1Fresh = await Project.findById(app1._id);
    assert.strictEqual(app1Fresh.name, 'Storefront API');
    console.log('✓ Successfully modified and renamed app to "Storefront API"\n');

    // 5. Test 8-Stage Production DevOps Pipeline
    console.log('Test 5: Verify 8-Stage Production Pipeline & Green Marks');
    assert.strictEqual(app1Fresh.pipelineStages.length, 8, 'Must have exactly 8 production stages');

    const expectedStageIds = [
      'architecture_scaffolding',
      'api_integrations_setup',
      'automated_testing',
      'code_quality_sonar',
      'security_audit_cve',
      'database_provisioning',
      'cloud_onprem_deployment',
      'zerotrust_network_live'
    ];

    app1Fresh.pipelineStages.forEach((stage, idx) => {
      assert.strictEqual(stage.step, idx + 1);
      assert.strictEqual(stage.id, expectedStageIds[idx]);
      assert.strictEqual(stage.status, 'completed');
      console.log(`   Stage ${stage.step}: ${stage.name} -> STATUS: GREEN ✓`);
    });
    console.log('✓ 8-Stage Pipeline with Green marks verified\n');

    // 6. Test WhatsApp Cloud API in Integrations Hub
    console.log('Test 6: Verify WhatsApp Cloud API Integration');
    const waIntegration = app1Fresh.integrations.find(i => i.id === 'whatsapp');
    assert.ok(waIntegration, 'WhatsApp Cloud API must be included in integrations');
    assert.strictEqual(waIntegration.enabled, true);
    assert.strictEqual(waIntegration.name, 'WhatsApp Cloud API');
    console.log('✓ WhatsApp Cloud API integration present & active\n');

    // 7. Test Contact Us Form
    console.log('Test 7: Contact Inquiry Storage');
    const contact = await Contact.create({
      name: 'Bruce Wayne',
      email: 'bruce@wayne-enterprises.com',
      phone: '+15558889999',
      preferredCloud: 'AWS Cloud',
      message: 'Need help deploying our multi-app microservices with WhatsApp OTP & MongoDB.'
    });
    assert.ok(contact._id);
    assert.strictEqual(contact.name, 'Bruce Wayne');
    console.log('✓ Contact inquiry saved and verified in database\n');

    console.log('====================================================');
    console.log('🎉 ALL ENHANCED UNIT & PIPELINE TESTS PASSED! 🚀');
    console.log('====================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runUnitTests();
