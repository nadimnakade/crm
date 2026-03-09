
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const { Sequelize, DataTypes, Op } = require('sequelize');
const dotenv = require('dotenv');

// Load env vars from backend .env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Database Connection
const sequelize = new Sequelize(process.env.DB_NAME, null, null, {
  host: process.env.DB_HOST,
  dialect: 'mssql',
  dialectOptions: {
    authentication: {
      type: 'ntlm',
      options: {
        userName: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        domain: process.env.DB_DOMAIN
      }
    },
    options: {
      instanceName: process.env.DB_INSTANCE,
      trustServerCertificate: true,
      requestTimeout: 300000
    }
  },
  logging: false
});

// Models
const AgentBase = sequelize.define('AgentBase', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  agentId: { type: DataTypes.INTEGER, allowNull: true },
  lastOrderDate: { type: DataTypes.DATE, allowNull: true },
  followUpDate: { type: DataTypes.DATE, allowNull: true },
  customerPhone: { type: DataTypes.STRING, allowNull: true },
  orderCount: { type: DataTypes.INTEGER, allowNull: true },
  customerName: { type: DataTypes.STRING, allowNull: true },
  orderId: { type: DataTypes.STRING, allowNull: true },
  payableAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  agentName: { type: DataTypes.STRING, allowNull: true },
  team: { type: DataTypes.STRING, allowNull: true }
}, { tableName: 'AgentBase', timestamps: true });

const User = sequelize.define('User', {
  firstName: { type: DataTypes.STRING },
  lastName: { type: DataTypes.STRING },
  username: { type: DataTypes.STRING }
}, { tableName: 'Users', timestamps: true });

// Helper
const parseExcelDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') {
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

async function run() {
  try {
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Connected.');

    const filePath = path.join(__dirname, '../../CRM Agent Base.xlsx');
    if (!fs.existsSync(filePath)) {
      console.error('File not found:', filePath);
      return;
    }

    console.log('Reading Excel file:', filePath);
    const workbook = xlsx.readFile(filePath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    let data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    console.log(`Found ${data.length} rows.`);

    // Normalize headers
    if (data.length > 0) {
      console.log('Original headers:', Object.keys(data[0]));
    }
    data = data.map(row => {
      const newRow = {};
      Object.keys(row).forEach(key => {
        newRow[key.trim().toLowerCase()] = row[key];
      });
      return newRow;
    });

    // User Map
    const users = await User.findAll({ attributes: ['id', 'firstName', 'lastName', 'username'] });
    const userMap = new Map();
    users.forEach(u => {
      const fullName = `${u.firstName} ${u.lastName}`.trim().toLowerCase();
      userMap.set(fullName, u.id);
      if (u.username) userMap.set(u.username.toLowerCase(), u.id);
    });

    const records = [];
    for (const row of data) {
      const rawAgentName = row['agent name'] || row['agent'] || '';
      const agentNameLower = String(rawAgentName).trim().toLowerCase();
      let agentId = userMap.get(agentNameLower) || null;

      let phone = row['number'] || row['phone'] || row['customer phone'] || row['mobile'] || '';
      phone = String(phone).replace(/[^0-9]/g, '');

      records.push({
        agentId,
        lastOrderDate: parseExcelDate(row['last order'] || row['last order date'] || row['date']),
        followUpDate: parseExcelDate(row['follow up'] || row['follow up date']),
        customerPhone: phone.substring(0, 255),
        orderCount: parseInt(row['count of order'] || row['order count'] || 0, 10),
        customerName: String(row['name'] || row['customer name'] || row['customer'] || '').substring(0, 255),
        orderId: String(row['order'] || row['order id'] || '').substring(0, 255),
        payableAmount: parseFloat(row['payable'] || row['payable amount'] || 0),
        agentName: String(rawAgentName || '').substring(0, 255),
        team: String(row['team'] || '').substring(0, 255)
      });
    }

    // Validation
    const validRecords = records.map(r => ({
      ...r,
      orderCount: isNaN(r.orderCount) ? 0 : r.orderCount,
      payableAmount: isNaN(r.payableAmount) ? 0 : r.payableAmount,
      lastOrderDate: r.lastOrderDate instanceof Date && !isNaN(r.lastOrderDate) ? r.lastOrderDate : null,
      followUpDate: r.followUpDate instanceof Date && !isNaN(r.followUpDate) ? r.followUpDate : null
    }));

    if (validRecords.length > 0) {
      console.log(`Inserting ${validRecords.length} records...`);
      // Use chunks to avoid packet size limits
      const chunkSize = 1000;
      for (let i = 0; i < validRecords.length; i += chunkSize) {
        const chunk = validRecords.slice(i, i + chunkSize);
        await AgentBase.bulkCreate(chunk);
        console.log(`Inserted batch ${i} - ${i + chunk.length}`);
      }
      console.log('Upload complete!');
    } else {
      console.log('No valid records to insert.');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

run();
