
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../models');

(async () => {
  try {
    await sequelize.authenticate();
    
    // 1. Check for EXACT phone duplicates
    const [exactDups] = await sequelize.query(`
      SELECT TOP 20 phone, COUNT(*) as count 
      FROM Customers 
      WHERE phone IS NOT NULL AND phone != ''
      GROUP BY phone 
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    console.log(`\n--- Exact Phone Duplicates (Top 20) ---`);
    exactDups.forEach(d => console.log(`Phone: "${d.phone}" Count: ${d.count}`));
    
    // 2. Check for CLEANED phone duplicates (last 10 digits)
    const [cleanDups] = await sequelize.query(`
      SELECT TOP 20 RIGHT(phone, 10) as cleanPhone, COUNT(*) as count 
      FROM Customers 
      WHERE phone IS NOT NULL AND LEN(phone) >= 10
      GROUP BY RIGHT(phone, 10) 
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `);
    
    console.log(`\n--- Cleaned Phone Duplicates (Top 20) ---`);
    cleanDups.forEach(d => console.log(`Phone: "${d.cleanPhone}" Count: ${d.count}`));

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();
