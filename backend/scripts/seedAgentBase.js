
require('dotenv').config(); // Load .env from CWD (backend)
const { sequelize, AgentBase, User } = require('../models');
const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../../CRM Agent Base.xlsx');

const parseExcelDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    // Excel date serial number (offset 25569 for 1970-01-01)
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

async function seed() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Database connected.');
    
    // Sync AgentBase model (create table if not exists)
    // We use alter: true to update schema if needed
    await AgentBase.sync({ alter: true });
    console.log('AgentBase table synced.');

    console.log('Reading file:', filePath);
    const workbook = xlsx.readFile(filePath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    console.log(`Found ${data.length} records in Excel.`);

    // Map users for agentId
    const users = await User.findAll({ attributes: ['id', 'firstName', 'lastName', 'username'] });
    const userMap = new Map();
    users.forEach(u => {
      // Map "First Last"
      const fullName = `${u.firstName} ${u.lastName}`.trim().toLowerCase();
      userMap.set(fullName, u.id);
      // Map username
      if (u.username) userMap.set(u.username.toLowerCase(), u.id);
      // Map "First" name only if unique? Might be risky.
      // Let's stick to full name and username for now.
    });

    console.log(`Loaded ${users.length} users for mapping.`);

    const records = [];
    let mappedCount = 0;

    for (const row of data) {
      const rawAgentName = row['Agent Name'] || row['Agent'] || '';
      const agentNameLower = String(rawAgentName).trim().toLowerCase();
      let agentId = userMap.get(agentNameLower) || null;
      
      if (agentId) mappedCount++;

      // Clean phone
      let phone = row['Number'] || row['Phone'] || '';
      // Convert to string and keep only digits
      phone = String(phone).replace(/[^0-9]/g, '');

      records.push({
        agentId,
        lastOrderDate: parseExcelDate(row['Last order '] || row['Last Order'] || row['Date']),
        followUpDate: parseExcelDate(row['Follow up'] || row['Follow Up']),
        customerPhone: phone,
        orderCount: parseInt(row['Count of Order'] || 0, 10),
        customerName: row['Name'] || row['Customer Name'],
        orderId: String(row['Order'] || row['Order ID'] || ''),
        payableAmount: parseFloat(row['payable'] || row['Payable'] || 0),
        agentName: rawAgentName,
        team: row['Team']
      });
    }

    console.log(`Mapped ${mappedCount} agents out of ${records.length} records.`);

    // Bulk insert in chunks
    const chunkSize = 500;
    let inserted = 0;
    
    // Optional: Clear existing data? 
    // await AgentBase.destroy({ where: {}, truncate: true });
    // console.log('Cleared existing AgentBase data.');

    for (let i = 0; i < records.length; i += chunkSize) {
      const chunk = records.slice(i, i + chunkSize);
      await AgentBase.bulkCreate(chunk);
      inserted += chunk.length;
      console.log(`Inserted ${inserted} / ${records.length}`);
    }

    console.log('Seeding completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();
