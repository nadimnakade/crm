
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, Call, Customer } = require('../models');
const { Op } = require('sequelize');

const DRY_RUN = true; // Set to false to apply changes

(async () => {
  try {
    await sequelize.authenticate();
    console.log(`Starting Fix Script (DRY_RUN=${DRY_RUN})...`);

    // 1. Find imported calls from the last 30 days
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 30);
    
    const calls = await Call.findAll({
      where: {
        notes: { [Op.like]: 'Auto-imported follow-up%' },
        createdAt: { [Op.gte]: sinceDate }
      },
      include: [{ model: Customer }],
      order: [['createdAt', 'DESC']]
      // Limit if needed, but let's process all recent ones
    });

    console.log(`Found ${calls.length} imported calls since ${sinceDate.toDateString()}.`);

    let mergeCandidates = 0;
    let processedCustomers = new Set();

    for (const call of calls) {
      if (!call.Customer) continue;
      const currentCust = call.Customer;
      
      if (processedCustomers.has(currentCust.id)) continue;
      processedCustomers.add(currentCust.id);

      // Clean phone
      const cleanPhone = String(currentCust.phone || '').replace(/\D/g, '').slice(-10);
      const name = (currentCust.firstName || '').trim().toLowerCase();

      // Search for OLDER customer with same Clean Phone
      // Or SAME NAME (if phone is different/missing)
      
      const whereClause = {
          id: { [Op.ne]: currentCust.id },
          createdAt: { [Op.lt]: currentCust.createdAt }, // Must be older
          [Op.or]: []
      };

      if (cleanPhone.length === 10) {
          whereClause[Op.or].push(
             sequelize.where(sequelize.fn('right', sequelize.col('phone'), 10), cleanPhone)
          );
      }
      
      // Also check exact name match? (Risky, but user complained about same name)
      if (name.length > 3) {
           whereClause[Op.or].push(
             sequelize.where(sequelize.fn('lower', sequelize.col('firstName')), name)
          );
      }
      
      if (whereClause[Op.or].length === 0) continue;

      const matches = await Customer.findAll({ where: whereClause });

      if (matches.length > 0) {
          // Score matches
          let bestMatch = null;
          
          for (const m of matches) {
              const mClean = String(m.phone || '').replace(/\D/g, '').slice(-10);
              const mName = (m.firstName || '').trim().toLowerCase();
              
              let score = 0;
              let reasons = [];
              
              if (mClean === cleanPhone && cleanPhone.length === 10) {
                  score += 10;
                  reasons.push('Phone Match');
              }
              if (mName === name) {
                  score += 5;
                  reasons.push('Name Match');
              }
              
              if (score > 0) {
                  if (!bestMatch || score > bestMatch.score) {
                      bestMatch = { customer: m, score, reasons };
                  }
              }
          }

          if (bestMatch) {
              mergeCandidates++;
              console.log(`\nMERGE CANDIDATE:`);
              console.log(`  Current (New): "${currentCust.firstName}" (Phone: ${currentCust.phone}) ID: ${currentCust.id} Created: ${currentCust.createdAt.toISOString().split('T')[0]}`);
              console.log(`  Target  (Old): "${bestMatch.customer.firstName}" (Phone: ${bestMatch.customer.phone}) ID: ${bestMatch.customer.id} Created: ${bestMatch.customer.createdAt.toISOString().split('T')[0]}`);
              console.log(`  Reason: ${bestMatch.reasons.join(', ')}`);
              
              if (!DRY_RUN) {
                  // Move call
                  // call.customerId = bestMatch.customer.id;
                  // await call.save();
                  // console.log(`  -> Call moved.`);
                  
                  // Check if Current Customer has other calls?
                  // If not, delete.
              }
          }
      }
    }

    console.log(`\nFound ${mergeCandidates} potential merges out of ${processedCustomers.size} customers checked.`);

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();
