require('dotenv').config();
const { sequelize, Call } = require('../models');
const { Op } = require('sequelize');
const xlsx = require('xlsx');
const path = require('path');

async function countImported() {
  try {
    await sequelize.authenticate();
    
    // 1. Count rows in Excel
    const FILE = 'C:\\CRM\\crm-app\\followup.xlsx';
    console.log('Reading Excel file...');
    const wb = xlsx.readFile(FILE);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });
    console.log(`Total rows in Excel: ${rows.length}`);

    // 2. Count imported calls in DB (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const count = await Call.count({
      where: {
        createdAt: { [Op.gte]: yesterday },
        notes: { [Op.like]: 'Auto-imported follow-up for%' }
      }
    });

    console.log(`Total imported follow-ups in DB (last 24h): ${count}`);
    
    const percent = ((count / rows.length) * 100).toFixed(1);
    console.log(`Progress: ${percent}%`);

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

countImported();
