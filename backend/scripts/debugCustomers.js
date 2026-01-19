
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../config/db');
const Customer = require('../models/Customer');
const { Op } = require('sequelize');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Connected to DB.');

    // Get customers created today (last 24 hours)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newCustomers = await Customer.findAll({
      where: {
        createdAt: {
          [Op.gte]: today
        }
      },
      limit: 20,
      order: [['createdAt', 'DESC']]
    });

    console.log(`Found ${newCustomers.length} customers created today (showing max 20).`);

    for (const c of newCustomers) {
      console.log(`\nNew Customer: ID=${c.id}, Name="${c.firstName} ${c.lastName}", Phone="${c.phone}"`);
      
      // Check for potential duplicates by Name
      const nameDups = await Customer.findAll({
        where: {
          firstName: c.firstName,
          id: { [Op.ne]: c.id }
        }
      });

      if (nameDups.length > 0) {
        console.log(`  -> Possible Duplicates by Name (${nameDups.length}):`);
        for (const d of nameDups) {
          console.log(`     ID=${d.id}, Phone="${d.phone}", CreatedAt=${d.createdAt}`);
        }
      } else {
        console.log('  -> No duplicates found by Name.');
      }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sequelize.close();
  }
})();
