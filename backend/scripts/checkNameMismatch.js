
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, Call, Customer } = require('../models');
const { Op } = require('sequelize');

(async () => {
  try {
    await sequelize.authenticate();
    
    // Fetch imported calls (limit to 1000 for speed)
    const calls = await Call.findAll({
      where: {
        notes: { [Op.like]: 'Auto-imported follow-up%' }
      },
      include: [{ model: Customer, attributes: ['id', 'firstName', 'lastName', 'phone'] }],
      limit: 1000,
      order: [['createdAt', 'DESC']]
    });

    console.log(`Checking ${calls.length} imported calls for name mismatch...`);
    
    let mismatches = 0;
    
    for (const call of calls) {
        // Extract name from "Auto-imported follow-up for NAME"
        const prefix = "Auto-imported follow-up for ";
        if (!call.notes.startsWith(prefix)) continue;
        
        const importedName = call.notes.substring(prefix.length).trim().toLowerCase();
        const customerName = (call.Customer?.firstName || '').trim().toLowerCase();
        
        // Simple check: does customerName contain importedName or vice versa?
        // Or exact match?
        // Let's check for "Significant difference"
        // e.g. "Manisha" vs "Satyam Jha" -> Mismatch.
        // "John" vs "John Doe" -> Match.
        
        if (!customerName.includes(importedName) && !importedName.includes(customerName)) {
            mismatches++;
            if (mismatches <= 10) {
                console.log(`Mismatch: Imported="${importedName}" vs Customer="${customerName}" (Phone: ${call.Customer?.phone})`);
            }
        }
    }
    
    console.log(`\nFound ${mismatches} mismatches out of ${calls.length} checked.`);
    console.log(`Mismatch Rate: ${((mismatches / calls.length) * 100).toFixed(1)}%`);

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();

