const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { sequelize } = require('../config/db');
const Customer = require('../models/Customer');

async function syncDatabase() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    console.log('Syncing database models...');
    
    // Sync all models (create tables if they don't exist)
    await sequelize.sync({ alter: true });
    
    console.log('Database sync completed successfully.');
    console.log('All tables have been created/updated.');

  } catch (error) {
    console.error('Database sync failed:', error);
  } finally {
    await sequelize.close();
  }
}

// Run the sync if this script is executed directly
if (require.main === module) {
  syncDatabase()
    .then(() => {
      console.log('Database sync process completed.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database sync process failed:', error);
      process.exit(1);
    });
}

module.exports = { syncDatabase };