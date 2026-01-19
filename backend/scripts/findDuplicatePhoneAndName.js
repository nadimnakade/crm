
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../models');

(async () => {
  try {
    await sequelize.authenticate();
    
    // Find duplicates by Phone AND First Name
    const [dups] = await sequelize.query(`
      SELECT phone, firstName, COUNT(*) as count 
      FROM Customers 
      WHERE phone IS NOT NULL AND phone != ''
      GROUP BY phone, firstName 
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    console.log(`Found ${dups.length} groups of (Phone+Name) duplicates.`);
    console.log(`\n--- Top 20 Duplicates ---`);
    dups.slice(0, 20).forEach(d => console.log(`"${d.firstName}" (${d.phone}): ${d.count} copies`));

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();
