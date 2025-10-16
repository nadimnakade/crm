const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { connectDB, sequelize } = require('./config/db');
const { syncDatabase, Role, User } = require('./models');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
// Request logging (lightweight)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// CORS whitelist via env (comma-separated origins)
// Always allow localhost dev origins when not in production, while preserving env configuration.
const envOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
const devOrigins = ['http://localhost:4200','http://localhost:4201', 'http://127.0.0.1:4200'];
const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
// If envOrigins is empty, allow all (legacy behavior). Otherwise allow env + dev (non-prod) origins.
const mergedAllowedOrigins = envOrigins.length === 0 ? null : [...envOrigins, ...(isProd ? [] : devOrigins)];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow same-origin/proxy
    if (mergedAllowedOrigins === null) {
      return callback(null, true); // no env config -> allow all
    }
    if (mergedAllowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection status endpoint
app.get('/api/status', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ 
      status: 'ok',
      message: 'Database connection is healthy',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      message: 'Database connection failed',
      error: error.message,
      timestamp: new Date()
    });
  }
});

// Routes
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/roles', require('./routes/roleRoutes'));
app.use('/api/calls', require('./routes/callRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/portfolio', require('./routes/portfolioRoutes'));
app.use('/api/customer-medicine-details', require('./routes/customerMedicineDetailRoutes'));
 // Import customers route removed per user instruction

// Serve frontend static files after API routes
const frontendDir = path.join(__dirname, '../frontend/crm/dist/crm');
// Serve uploaded files statically for direct access
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Also expose uploads under /api for dev proxy compatibility
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(frontendDir));

// SPA fallback for non-API routes
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// Seed default role and superadmin user if missing
async function seedDefaults() {
  try {
    const [role] = await Role.findOrCreate({
      where: { name: 'Super Admin' },
      defaults: {
        name: 'Super Admin',
        description: 'Full access role',
        permissions: ['*']
      }
    });

    await User.findOrCreate({
      where: { email: 'superadmin@crm.com' },
      defaults: {
        username: 'superadmin',
        email: 'superadmin@crm.com',
        password: '123456', // plain text per current setup
        firstName: 'Super',
        lastName: 'Admin',
        roleId: role.id,
        isActive: true
      }
    });

    console.log('Seed check complete: Super Admin role and user ensured');
  } catch (err) {
    console.error('Seed failed:', err);
  }
}

// Kick off seed after DB sync
(async () => {
  try {
    //await seedDefaults();
  } catch {}
})();

// Connect to MySQL and start server
const PORT = process.env.PORT || 5000;

// Connect to database and start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Sync database models
    await syncDatabase();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    // Retry connection after delay
    console.log('Retrying connection in 5 seconds...');
    setTimeout(startServer, 5000);
  }
};

// Start the server
startServer();