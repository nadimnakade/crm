
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../config/db');
const Customer = require('../models/Customer');
const Call = require('../models/Call');
const { Op } = require('sequelize');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Connected.');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Find calls imported today
    // We only care about calls that created a NEW customer.
    // So we find customers created today who HAVE imported calls.
    
    // Find customers created today
    const newCustomers = await Customer.findAll({
      where: { createdAt: { [Op.gte]: today } },
      attributes: ['id', 'firstName', 'lastName', 'phone', 'createdAt']
    });
    console.log(`Found ${newCustomers.length} customers created today.`);

    let potentialMerges = 0;

    for (const newC of newCustomers) {
        // Check if this customer actually has the imported call? 
        // (Optional, but good verification)
        const call = await Call.findOne({
            where: {
                customerId: newC.id,
                notes: { [Op.like]: 'Auto-imported follow-up%' }
            }
        });
        
        if (!call) {
            // This customer was created today but NOT by our import (or call creation failed)
            // Skip
            continue;
        }

        const pClean = (newC.phone || '').replace(/\D/g, '');
        if (pClean.length < 6) continue; // Too short to match reliably

        // Search for existing customers with matching FIRST NAME
        const candidates = await Customer.findAll({
            where: {
                id: { [Op.ne]: newC.id },
                createdAt: { [Op.lt]: today },
                firstName: newC.firstName
            }
        });

        if (candidates.length > 0) {
            console.log(`\nMERGE PROPOSAL (Name Match):`);
            console.log(`  New (ID:${newC.id}): "${newC.firstName}" Phone="${newC.phone}" (Call ID: ${call.id})`);
            for (const match of candidates) {
                console.log(`  Old (ID:${match.id}): "${match.firstName}" Phone="${match.phone}"`);
            }
            potentialMerges++;
        }
        
        if (potentialMerges >= 20) {
            console.log('\nStopped after finding 20 potential merges.');
            break;
        }
    }

    console.log(`\nTotal potential merges found: ${potentialMerges}`);

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();

