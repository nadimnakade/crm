const path = require('path');
// Load env vars from one level up (backend root)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Customer, Call, sequelize } = require('../models');
const { connectDB } = require('../config/db');
const { Op } = require('sequelize');

async function mergeDuplicates() {
  try {
    console.log('Starting duplicate merge process...');

    // 1. Fetch all customers
    const customers = await Customer.findAll({
      attributes: ['id', 'phone', 'firstName', 'lastName'],
      where: {
        phone: {
          [Op.ne]: null
        }
      },
      raw: true
    });

    console.log(`Fetched ${customers.length} customers with phone numbers.`);

    // 2. Group by phone
    const phoneGroups = {};
    customers.forEach(c => {
      if (!c.phone) return;
      const phone = String(c.phone).trim();
      if (!phone) return;
      
      if (!phoneGroups[phone]) {
        phoneGroups[phone] = [];
      }
      phoneGroups[phone].push(c);
    });

    // 3. Process duplicates
    let mergedCount = 0;
    let deletedCount = 0;

    // Get keys and iterate
    const phones = Object.keys(phoneGroups);
    console.log(`Found ${phones.length} unique phone numbers.`);

    for (const phone of phones) {
      const group = phoneGroups[phone];
      
      if (group.length > 1) {
        // Sort by ID (keep the oldest/lowest ID)
        group.sort((a, b) => a.id - b.id);
        
        const primary = group[0];
        const duplicates = group.slice(1);
        const duplicateIds = duplicates.map(d => d.id);

        console.log(`Merging phone '${phone}': Keeping ID ${primary.id} (${primary.firstName} ${primary.lastName}), merging IDs: ${duplicateIds.join(', ')}`);

        try {
          // Transaction for safety
          await sequelize.transaction(async (t) => {
            // Update Calls
            const [updatedCalls] = await Call.update(
              { customerId: primary.id },
              { 
                where: { customerId: { [Op.in]: duplicateIds } },
                transaction: t
              }
            );
            
            if (updatedCalls > 0) {
                console.log(`  - Reassigned ${updatedCalls} calls to customer ID ${primary.id}`);
            }

            // Delete duplicate customers
            await Customer.destroy({
              where: { id: { [Op.in]: duplicateIds } },
              transaction: t
            });
          });

          mergedCount += 1;
          deletedCount += duplicateIds.length;
        } catch (err) {
          console.error(`  - Failed to merge group for phone ${phone}:`, err.message);
        }
      }
    }

    console.log('-----------------------------------');
    console.log(`Merge complete.`);
    console.log(`Unique phone groups processed: ${phones.length}`);
    console.log(`Duplicate groups merged: ${mergedCount}`);
    console.log(`Duplicate customer records deleted: ${deletedCount}`);

  } catch (error) {
    console.error('Error in mergeDuplicates:', error);
  } finally {
    // Close connection
    try {
        await sequelize.close();
        console.log('Database connection closed.');
    } catch (e) {
        console.error('Error closing database connection:', e);
    }
    process.exit(0);
  }
}

// Connect to DB then run
connectDB().then(() => {
    mergeDuplicates();
}).catch(err => {
    console.error('Failed to connect to DB:', err);
    process.exit(1);
});
