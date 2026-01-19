/*
 * One-off script to import follow-ups from followup.xlsx
 * Creates missing customers and inserts Call rows with followUpDate.
 * Run:  node scripts/importFollowUps.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const xlsx = require('xlsx');
const path = require('path');
const { sequelize } = require('../config/db');
const { Op } = require('sequelize');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Call = require('../models/Call');

const FILE = path.resolve(__dirname, '../../followup.xlsx'); // <- adjust if file moves

(async () => {
  try {
    console.log('Connecting DB…');
    await sequelize.authenticate();

    console.log('Reading Excel…');
    const wb = xlsx.readFile(FILE);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });

    console.log(`Found ${rows.length} rows`);

    let createdCustomers = 0;
    let createdCalls = 0;
    let skipped = 0;

    for (const r of rows) {
      const phone = String(r.Number || '').trim();
      const rawDate = r.Date;
      const agentName = String(r.Agent || '').trim();
      const custName = String(r.Name || '').trim();

      if (!phone || custName.toUpperCase() === '#N/A') {
        skipped++;
        continue;
      }

      // ---------- customer ----------
      // Improved matching logic: Match by Exact Phone OR (Clean Phone + Fuzzy Name)
      let customer = await Customer.findOne({ where: { phone } });
      
      if (!customer) {
          // Try fuzzy match by cleaned phone
          const cleanPhone = (p) => String(p).replace(/\D/g, '').slice(-10);
          const pClean = cleanPhone(phone);
          
          if (pClean.length >= 10) {
              const candidates = await Customer.findAll({
                  where: sequelize.where(sequelize.fn('right', sequelize.col('phone'), 10), pClean)
              });
              
              if (candidates.length > 0) {
                  // Check for Name Match
                  const nameMatch = candidates.find(c => {
                       const cName = (c.firstName || '').toLowerCase();
                       const iName = custName.toLowerCase();
                       // Match if one contains the other (e.g. "John" in "John Doe")
                       // Require at least 3 chars to avoid "A" matching "Apple"
                       return (cName.length > 2 && iName.length > 2) && 
                              (cName.includes(iName) || iName.includes(cName));
                  });
                  
                  if (nameMatch) {
                      customer = nameMatch;
                      // Optional: Update customer phone to the format in Excel? 
                      // No, keep original as it might be better.
                  } else {
                      // Found phone match but Name mismatch. 
                      // Assume it's a different person sharing the phone (or significant name change).
                      // Create NEW customer to avoid "Wrong Linkage".
                      // Log it for visibility
                      // console.log(`Phone collision: ${phone}. Name mismatch: "${custName}" vs "${candidates[0].firstName}". Creating new.`);
                  }
              }
          }
      }

      if (!customer) {
        customer = await Customer.create({
          firstName: custName || phone,
          lastName: '',
          phone,
          address: '',
          pinCode: '',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        createdCustomers++;
      }

      // ---------- agent ----------
      // Agent col contains "FirstName LastName Agent" – grab first word
      const first = agentName.split(/\s+/)[0];
      const agent = await User.findOne({
        where: sequelize.where(
          sequelize.fn('lower', sequelize.col('firstName')),
          sequelize.fn('lower', first)
        )
      });
      if (!agent) {
        console.warn(`Agent not found: ${agentName} – skipping row for ${phone}`);
        skipped++;
        continue;
      }

      // ---------- parse follow-up date ----------
      let followUpDate;
      if (typeof rawDate === 'number') {
        // Excel serial date -> JS Date
        followUpDate = new Date((rawDate - 25569) * 86400 * 1000);
      } else {
        const dateStr = String(rawDate || '').trim();
        // "14-Jan" text
        const [dd, mmm] = dateStr.split('-');
        const monthMap = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
        };
        const month = monthMap[mmm?.toLowerCase()];
        if (month === undefined) {
            // Try parsing as number if it's a string like "45989"
            const num = Number(dateStr);
            if (!isNaN(num) && num > 20000) {
                followUpDate = new Date((num - 25569) * 86400 * 1000);
            } else {
                console.warn(`Bad date: ${dateStr} – skipping row for ${phone}`);
                skipped++;
                continue;
            }
        } else {
            followUpDate = new Date(2024, month, parseInt(dd, 10));
        }
      }

      // ---------- call ----------
      // Check for existing duplicate call to allow re-running script
      const existingCall = await Call.findOne({
        where: {
            customerId: customer.id,
            followUpDate: followUpDate,
            outcome: 'follow-up scheduled',
            notes: `Auto-imported follow-up for ${custName}`
        }
      });

      if (existingCall) {
          // console.log(`Skipping duplicate call for ${phone}`);
          skipped++;
          continue;
      }

      await Call.create({
        customerId: customer.id,
        agentId: agent.id,
        date: new Date(), // today
        callType: 'outbound',
        category: 'sales-call',
        outcome: 'follow-up scheduled',
        followUpRequired: true,
        followUpDate,
        notes: `Auto-imported follow-up for ${custName}`
      });
      createdCalls++;
      
      // Log progress every 100 records
      if (createdCalls % 100 === 0) {
          console.log(`Progress: Created ${createdCalls} calls...`);
      }
    }

    console.log('Done.');
    console.log(`Created customers: ${createdCustomers}`);
    console.log(`Created calls: ${createdCalls}`);
    console.log(`Skipped: ${skipped}`);
  } catch (e) {
    console.error('Import failed:', e);
  } finally {
    await sequelize.close();
  }
})();