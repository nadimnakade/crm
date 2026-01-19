
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, Customer } = require('../models');
const { Op } = require('sequelize');

(async () => {
  try {
    await sequelize.authenticate();
    
    // Get customers created in 2026 (likely the "new" ones from recent imports)
    const newCustomers = await Customer.findAll({
      where: {
        createdAt: {
          [Op.gte]: new Date('2026-01-01')
        }
      },
      order: [['createdAt', 'DESC']]
    });

    console.log(`Found ${newCustomers.length} customers created in 2026.`);
    
    let potentialDuplicates = 0;
    
    for (const newCust of newCustomers) {
        const cleanPhone = String(newCust.phone || '').replace(/\D/g, '').slice(-10);
        const firstName = (newCust.firstName || '').trim().toLowerCase();
        
        // Skip if not enough info
        if (cleanPhone.length < 10 && firstName.length < 2) continue;

        // Find potential duplicates (Older customers)
        const whereClause = {
            id: { [Op.ne]: newCust.id },
            createdAt: { [Op.lt]: newCust.createdAt }, // Only older ones
            [Op.or]: []
        };
        
        // 1. Match by Phone (if valid)
        if (cleanPhone.length === 10) {
            whereClause[Op.or].push(
                sequelize.where(
                    sequelize.fn('right', sequelize.col('phone'), 10),
                    cleanPhone
                )
            );
        }
        
        // Removed Name Match for now to focus on Phone Formatting issues
        
        if (whereClause[Op.or].length === 0) continue;

        const matches = await Customer.findAll({
            where: whereClause,
            limit: 5
        });

        if (matches.length > 0) {
            // Check if it's a "Hidden" duplicate (i.e. string differs but cleaned matches)
            const meaningfulMatches = matches.filter(m => {
                const mClean = String(m.phone || '').replace(/\D/g, '').slice(-10);
                return mClean === cleanPhone;
            });

            if (meaningfulMatches.length > 0) {
                potentialDuplicates++;
                console.log(`\nPHONE DUPLICATE: New Customer: "${newCust.firstName}" (Raw: '${newCust.phone}') ID: ${newCust.id}`);
                meaningfulMatches.forEach(m => {
                     console.log(`  -> Match: "${m.firstName}" (Raw: '${m.phone}') ID: ${m.id}`);
                });
                
                if (potentialDuplicates >= 20) break;
            }
        }
    }
    
    console.log(`\nFound matches for ${potentialDuplicates} new customers.`);

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();

