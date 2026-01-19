
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, Customer, Call } = require('../models');
const { Op } = require('sequelize');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Starting Duplicate Merge...');

    let totalMerged = 0;
    let totalGroups = 0;

    while (true) {
      // 1. Find batches of duplicates
      const [groups] = await sequelize.query(`
        SELECT TOP 50 phone, firstName, COUNT(*) as count 
        FROM Customers 
        WHERE phone IS NOT NULL AND phone != ''
        GROUP BY phone, firstName 
        HAVING COUNT(*) > 1
        ORDER BY count DESC
      `);

      if (groups.length === 0) {
        console.log('No more duplicates found.');
        break;
      }

      console.log(`Processing batch of ${groups.length} groups...`);

      for (const g of groups) {
        const transaction = await sequelize.transaction();
        try {
            // Find all customers in this group
            // Handle null firstName if necessary (though group by usually handles it)
            const whereClause = {
                phone: g.phone
            };
            
            if (g.firstName) {
                whereClause.firstName = g.firstName;
            } else {
                whereClause.firstName = { [Op.or]: [null, ''] };
            }

            const customers = await Customer.findAll({
                where: whereClause,
                order: [['id', 'ASC']], // Oldest first
                transaction,
                lock: true // Lock rows
            });

            if (customers.length < 2) {
                await transaction.commit();
                continue;
            }

            const keeper = customers[0];
            const toMerge = customers.slice(1);
            const toMergeIds = toMerge.map(c => c.id);

            // 1. Move Calls
            await Call.update(
                { customerId: keeper.id },
                { where: { customerId: { [Op.in]: toMergeIds } }, transaction }
            );

            // 2. Delete Duplicates
            await Customer.destroy({
                where: { id: { [Op.in]: toMergeIds } },
                transaction
            });

            await transaction.commit();
            
            const mergedCount = toMergeIds.length;
            totalMerged += mergedCount;
            totalGroups++;
            
            process.stdout.write(`.`); // Progress dot
            
        } catch (err) {
            await transaction.rollback();
            console.error(`\nError processing group ${g.firstName} (${g.phone}):`, err);
        }
      }
      
      console.log(`\nBatch done. Total merged so far: ${totalMerged} customers in ${totalGroups} groups.`);
    }

    console.log(`\nMerge Complete! Total merged: ${totalMerged} customers.`);

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();
