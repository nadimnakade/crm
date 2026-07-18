require('dotenv').config();
const { Sequelize } = require('sequelize');
const s = new Sequelize(process.env.DB_NAME, null, null, {
  host: process.env.DB_HOST,
  dialect: 'mssql',
  dialectOptions: {
    authentication: {
      type: 'ntlm',
      options: { userName: process.env.DB_USER, password: process.env.DB_PASSWORD, domain: process.env.DB_DOMAIN }
    },
    options: { instanceName: process.env.DB_INSTANCE, trustServerCertificate: true, requestTimeout: 30000 }
  },
  logging: false
});

(async () => {
  try {
    await s.authenticate();
    console.log('Connected');

    const [rows] = await s.query(`SELECT TOP 10 id, callType, followUpRequired, followUpDate, outcome, customerId, notes FROM dbo.Calls ORDER BY id DESC`);
    console.log('Last 10 calls:');
    rows.forEach(r => console.log(JSON.stringify(r)));

    process.exit();
  } catch(e) {
    console.log('Error:', e.message);
    process.exit(1);
  }
})();
