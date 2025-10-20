const { Sequelize } = require('sequelize');

// Create a new Sequelize instance
// Use Windows authentication (trusted connection): pass null for username/password
const sequelize = new Sequelize(process.env.DB_NAME, null, null, {
  host: process.env.DB_HOST,
  dialect: 'mssql',
  dialectOptions: {
    authentication: {
      type: 'ntlm',
      options: {
        userName: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        domain: process.env.DB_DOMAIN
      }
    },
    options: {
      instanceName: process.env.DB_INSTANCE,
      trustServerCertificate: true,
      // Increase request timeout to reduce ETIMEOUT on large queries
      requestTimeout: 300000
    }
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 60000,
    idle: 10000
  }
});

// Test the connection
const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('SQL Server connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };