
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, Customer, Call } = require('../models');
const { Op } = require('sequelize');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Checking Manisha...');

    // Find customers named Manisha
    const customers = await Customer.findAll({
      where: {
        firstName: { [Op.like]: '%Manisha%' }
      },
      include: [{ model: Call }]
    });

    console.log(`Found ${customers.length} customers named Manisha.`);
    
    for (const c of customers) {
        console.log(`ID: ${c.id}, Name: ${c.firstName} ${c.lastName}, Phone: ${c.phone}, Calls: ${c.Calls.length}`);
        c.Calls.forEach(call => {
            console.log(`  - Call ID: ${call.id}, Date: ${call.date}, Notes: "${call.notes}"`);
        });
    }

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();
