
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../config/db');
const Customer = require('../models/Customer');
const { Op } = require('sequelize');

(async () => {
  try {
    await sequelize.authenticate();
    
    // Get customers created today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newCustomers = await Customer.findAll({
      where: { createdAt: { [Op.gte]: today } },
      limit: 100
    });

    for (const newCust of newCustomers) {
      // Find older customers with same first name
      const oldCusts = await Customer.findAll({
        where: {
          firstName: newCust.firstName,
          id: { [Op.ne]: newCust.id },
          createdAt: { [Op.lt]: today }
        }
      });

      if (oldCusts.length > 0) {
        console.log(`\nMatch found for Name: "${newCust.firstName}"`);
        console.log(`  New Customer (ID: ${newCust.id}): Phone="${newCust.phone}"`);
        for (const old of oldCusts) {
          console.log(`  Old Customer (ID: ${old.id}): Phone="${old.phone}"`);
        }
        
        // Compare phones after stripping non-digits
        const newPhoneClean = newCust.phone.replace(/\D/g, '');
        const matchingOld = oldCusts.find(o => o.phone.replace(/\D/g, '') === newPhoneClean);
        
        if (matchingOld) {
            console.log(`  => Phones match when cleaned! ("${newPhoneClean}")`);
            console.log(`  => Should move calls from ${newCust.id} to ${matchingOld.id}`);
        } else {
            console.log(`  => Phones DO NOT match even when cleaned.`);
        }
        
        // Stop after 5 examples
        if (--process.env.MAX_EXAMPLES === 0) break;
      }
    }

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();
