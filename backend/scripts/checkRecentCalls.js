
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, Call, Customer } = require('../models');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Checking recent calls for Manisha...');

    const recentCalls = await Call.findAll({
      limit: 20,
      where: {
        notes: { [require('sequelize').Op.like]: '%Auto-imported follow-up for Manisha%' }
      },
      order: [['createdAt', 'DESC']],
      include: [{ model: Customer, attributes: ['firstName', 'lastName', 'phone'] }]
    });

    console.log(`Found ${recentCalls.length} recent calls.`);
    
    recentCalls.forEach(call => {
        console.log(`Call ID: ${call.id}`);
        console.log(`  - Customer: ${call.Customer ? `${call.Customer.firstName} ${call.Customer.lastName} (${call.Customer.phone})` : 'NULL'}`);
        console.log(`  - CreatedAt: ${call.createdAt}`);
        console.log(`  - Date: ${call.date}`);
        console.log(`  - Notes: "${call.notes}"`);
        console.log('---');
    });

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();
