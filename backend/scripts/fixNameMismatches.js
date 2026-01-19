
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize, Call, Customer } = require('../models');
const { Op } = require('sequelize');

const BATCH_SIZE = 100;

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Starting Name Mismatch Fix...');

    let processed = 0;
    let fixed = 0;
    let created = 0;

    while (true) {
      // Find calls with "Auto-imported..." notes
      // We process in batches.
      // To avoid infinite loops if we don't fix them, we need a way to track.
      // But we ARE fixing them (by moving them or verifying).
      // However, if we decide it's NOT a mismatch, we'll keep picking it up.
      // So we should filter by those we haven't checked? Hard without a flag.
      // Let's just fetch all and process, but limit to recent ones or iterate carefully.
      
      // Better: Fetch all calls, filtering by ID > lastProcessedId
      
      const calls = await Call.findAll({
        where: {
            notes: { [Op.like]: 'Auto-imported follow-up for %' }
        },
        include: [{ model: Customer }],
        order: [['id', 'DESC']], // Process newest first
        limit: 500,
        offset: processed
      });

      if (calls.length === 0) break;

      console.log(`Processing batch of ${calls.length} calls...`);

      for (const call of calls) {
        if (!call.Customer) continue; // Orphaned call

        const prefix = "Auto-imported follow-up for ";
        const importedName = call.notes.substring(prefix.length).trim();
        const customerName = (call.Customer.firstName || '').trim();
        const phone = call.Customer.phone;

        // Check for mismatch
        const iNameLower = importedName.toLowerCase();
        const cNameLower = customerName.toLowerCase();
        
        const isMatch = (cNameLower.length > 2 && iNameLower.length > 2) && 
                        (cNameLower.includes(iNameLower) || iNameLower.includes(cNameLower));
        
        if (isMatch) {
            // Correctly linked.
            continue;
        }

        // Mismatch found!
        // console.log(`Mismatch: Note="${importedName}" vs Cust="${customerName}" (Phone: ${phone})`);
        
        // 1. Try to find the CORRECT customer (Name + Phone)
        const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
        
        let correctCustomer = null;
        
        if (cleanPhone.length >= 10) {
            const candidates = await Customer.findAll({
                where: sequelize.where(sequelize.fn('right', sequelize.col('phone'), 10), cleanPhone)
            });
            
            correctCustomer = candidates.find(c => {
                const cN = (c.firstName || '').toLowerCase();
                return (cN.length > 2) && (cN.includes(iNameLower) || iNameLower.includes(cN));
            });
        }

        if (!correctCustomer) {
            // Create new customer
            // console.log(`  -> Creating new customer: "${importedName}"`);
            correctCustomer = await Customer.create({
                firstName: importedName,
                lastName: '', // or extract from importedName?
                phone: phone, // Use original phone
                address: '', // Default empty address
                status: 'New', // Default status
                createdAt: call.createdAt, // Backdate to call date? Or now? Call date is better for history.
                updatedAt: new Date()
            });
            created++;
        }

        // Move call
        call.customerId = correctCustomer.id;
        await call.save();
        fixed++;
        // console.log(`  -> Call moved to ID ${correctCustomer.id}`);
      }
      
      processed += calls.length;
      console.log(`Processed ${processed}. Fixed ${fixed}. Created ${created}.`);
      
      // Safety break for testing
      if (processed >= 5000) {
          console.log('Reached limit of 5000 calls. Stopping.');
          break;
      }
    }

    console.log(`\nDone. Fixed ${fixed} calls (Created ${created} new customers).`);

  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
})();

