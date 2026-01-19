
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, Customer } = require('../models');

(async () => {
  try {
    await sequelize.authenticate();
    
    // Check specific customers identified as duplicates
    const ids = [40539, 61618]; 
    // Note: Use IDs from your previous debug output if available. 
    // If you don't have them, we can search by name "Muinath Sharma"
    
    const customers = await Customer.findAll({
        where: {
            // Search by name if IDs are uncertain
            firstName: 'Muinath Sharma' 
        }
    });

    console.log(`Found ${customers.length} customers named "Muinath Sharma".`);

    for (const c of customers) {
        console.log(`\nID: ${c.id}`);
        console.log(`Phone: "${c.phone}"`);
        console.log(`Phone Length: ${c.phone ? c.phone.length : 0}`);
        console.log(`Phone Char Codes: ${c.phone ? c.phone.split('').map(x => x.charCodeAt(0)).join(',') : 'N/A'}`);
        console.log(`CreatedAt: ${c.createdAt}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();
