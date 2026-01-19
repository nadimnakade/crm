
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, Customer } = require('../models');
const { Op } = require('sequelize');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Checking recently created customers...');

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const newCustomers = await Customer.findAll({
      where: {
        createdAt: { [Op.gte]: startOfDay }
      },
      limit: 20,
      order: [['createdAt', 'DESC']]
    });

    console.log(`Found ${newCustomers.length} customers created today.`);
    
    newCustomers.forEach(c => {
        console.log(`ID: ${c.id}, Name: ${c.firstName} ${c.lastName}, Phone: ${c.phone}, CreatedAt: ${c.createdAt}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();
