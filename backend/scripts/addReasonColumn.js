
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../models');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Checking if "reason" column exists in Calls table...');

    const [results] = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Calls' AND COLUMN_NAME = 'reason'
    `);

    if (results.length === 0) {
      console.log('Adding "reason" column...');
      await sequelize.query(`
        ALTER TABLE Calls
        ADD reason NVARCHAR(255) NULL;
      `);
      console.log('Column added successfully.');
    } else {
      console.log('Column "reason" already exists.');
    }

  } catch (err) {
    console.error('Error updating schema:', err);
  } finally {
    await sequelize.close();
  }
})();
