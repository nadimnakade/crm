
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, Customer } = require('../models');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Checking duplicates for phone 9113787480...');

    const customers = await Customer.findAll({
      where: {
        phone: '9113787480'
      }
    });

    console.log(`Found ${customers.length} customers.`);
    
    customers.forEach(c => {
        console.log(`ID: ${c.id}, Name: ${c.firstName} ${c.lastName}, Phone: ${c.phone}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();
