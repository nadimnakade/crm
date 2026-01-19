
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, Customer, Call } = require('../models');
const { Op } = require('sequelize');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Searching for calls with "Manisha" in notes...');

    const calls = await Call.findAll({
      where: {
        notes: { [Op.like]: '%Manisha%' }
      },
      include: [{ model: Customer }]
    });

    console.log(`Found ${calls.length} calls with "Manisha" in notes.`);
    
    for (const call of calls) {
        console.log(`Call ID: ${call.id}, Notes: "${call.notes}"`);
        if (call.Customer) {
            console.log(`  - Linked Customer: ${call.Customer.firstName} ${call.Customer.lastName} (ID: ${call.Customer.id})`);
        } else {
            console.log(`  - Linked Customer: NULL`);
        }
    }

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();
