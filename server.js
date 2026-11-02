require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, getStatus } = require('./config/db');

const { router: authRouter } = require('./routes/auth');
const projectRouter = require('./routes/projects');
const contactRouter = require('./routes/contact');

const app = express();
const PORT = process.env.PORT || 5000;

// Security and middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/projects', projectRouter);
app.use('/api/contact', contactRouter);

// Health check and System Status endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = getStatus();
  const uptimeSeconds = Math.floor(process.uptime());
  const memUsage = process.memoryUsage();

  return res.json({
    status: 'online',
    appName: 'DevMatrix Platform',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`,
    memory: {
      rssMb: (memUsage.rss / 1024 / 1024).toFixed(1),
      heapUsedMb: (memUsage.heapUsed / 1024 / 1024).toFixed(1)
    },
    database: {
      target: 'localhost:27017',
      name: 'devmatrix_db',
      connected: dbStatus.connectedToMongo,
      fallbackActive: dbStatus.fallbackActive,
      driver: 'mongodb-native-client',
      statusMessage: dbStatus.connectedToMongo 
        ? 'Connected to local MongoDB (mongodb://127.0.0.1:27017)' 
        : 'Connecting to MongoDB... (Resilient Local Engine Active)'
    },
    pipelineCapabilities: [
      'App-Building',
      'Testing App',
      'Code Quality-Test',
      'Deployment (Cloud / On-Prem)',
      'Database Setup',
      'Network & Security',
      'Complete Setup'
    ]
  });
});

// Explicit routes for SPA/MPA pages
app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Catch-all route to serve index.html for any unhandled GET page request
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

// Initialize database and start HTTP server
async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  🚀 DevMatrix Platform Server is RUNNING!`);
    console.log(`  🌐 Website URL:   http://localhost:${PORT}`);
    console.log(`  🔐 Auth Page:     http://localhost:${PORT}/auth`);
    console.log(`  📊 Dashboard:     http://localhost:${PORT}/dashboard`);
    console.log(`  🩺 Health Check:  http://localhost:${PORT}/api/health`);
    console.log(`  🍃 MongoDB:       mongodb://127.0.0.1:27017/devmatrix_db`);
    console.log(`====================================================`);
  });
}

startServer();

module.exports = app;

