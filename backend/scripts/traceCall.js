
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../config/db');
const Customer = require('../models/Customer');
const Call = require('../models/Call');
const { Op } = require('sequelize');

(async () => {
  try {
    await sequelize.authenticate();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find one imported call created TODAY
    const call = await Call.findOne({
      where: {
        notes: { [Op.like]: 'Auto-imported follow-up%' },
        createdAt: { [Op.gte]: today }
      },
      order: [['createdAt', 'DESC']]
    });

    if (!call) {
      console.log('No imported calls found FOR TODAY.');
      // Fallback: check count
      const count = await Call.count({
          where: {
            notes: { [Op.like]: 'Auto-imported follow-up%' }
          }
      });
      console.log(`Total imported calls (all time): ${count}`);
      return;
    }

    console.log(`\nFound Call ID: ${call.id}`);
    console.log(`Call Notes: "${call.notes}"`);
    console.log(`Call CreatedAt: ${call.createdAt}`);
    console.log(`CustomerId: ${call.customerId}`);

    const customer = await Customer.findByPk(call.customerId);
    if (customer) {
      console.log(`\nCustomer Details:`);
      console.log(`  ID: ${customer.id}`);
      console.log(`  Name: "${customer.firstName} ${customer.lastName}"`);
      console.log(`  Phone: "${customer.phone}"`);
      console.log(`  CreatedAt: ${customer.createdAt}`);
      
      // Search for duplicates by Name
      const duplicates = await Customer.findAll({
        where: {
          firstName: customer.firstName,
          id: { [Op.ne]: customer.id }
        }
      });
      
      if (duplicates.length > 0) {
        console.log(`\nPotential Duplicates by Name (${duplicates.length}):`);
        for (const d of duplicates) {
          console.log(`  ID: ${d.id}, Name: "${d.firstName} ${d.lastName}", Phone: "${d.phone}", Created: ${d.createdAt}`);
        }
      } else {
        console.log('\nNo duplicates found by Name.');
      }

    } else {
      console.log('\nCustomer not found!');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();