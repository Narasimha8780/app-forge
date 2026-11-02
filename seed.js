const User = require('./models/User');
const { Project } = require('./models/Project');
const Contact = require('./models/Contact');
const { connectDB } = require('./config/db');

async function seed() {
  await connectDB();
  console.log('🌱 Seeding demo data for DevMatrix Platform...');

  try {
    let demoUser = await User.findByUsername('demouser');
    if (!demoUser) {
      demoUser = await User.create({
        firstName: 'Alex',
        lastName: 'Developer',
        username: 'demouser',
        email: 'alex@devmatrix.io',
        mobile: '+15551234567',
        password: 'Password123'
      });
      console.log('✓ Created demo user: demouser (Password123)');
    }

    // Ensure user has their first app based on username
    const existingProjects = await Project.findByUserId(demoUser._id);
    if (existingProjects.length === 0) {
      await Project.createDefault(demoUser._id, `${demoUser.username}-app`);
      await Project.createDefault(demoUser._id, `${demoUser.username}-api-2`);
      console.log(`✓ Created initial apps: ${demoUser.username}-app and ${demoUser.username}-api-2`);
    }

    // Sample contact message
    await Contact.create({
      name: 'Jessica Alba',
      email: 'jessica@techcorp.io',
      phone: '+15559876543',
      preferredCloud: 'AWS Cloud',
      message: 'Looking for assistance setting up WhatsApp Cloud API webhooks with MongoDB database & automated 8-stage pipeline.'
    });
    console.log('✓ Seeded sample contact inquiry');

    console.log('🌱 Seeding complete! You can start the server with: npm start');
  } catch (err) {
    console.error('Seed error:', err.message);
  }
}

if (require.main === module) {
  seed().then(() => process.exit(0));
}

module.exports = seed;
