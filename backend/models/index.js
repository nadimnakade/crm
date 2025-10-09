const User = require('./User');
const Role = require('./Role');
const Customer = require('./Customer');
const Call = require('./Call');
const CallAttachment = require('./CallAttachment');
const CustomerPortfolio = require('./CustomerPortfolio');
const CallStatusHistory = require('./CallStatusHistory');
const { sequelize } = require('../config/db');

// Define associations
User.belongsTo(Role, { foreignKey: 'roleId' });
Role.hasMany(User, { foreignKey: 'roleId' });

// Manager → Agents relationship
User.belongsTo(User, { foreignKey: 'managerId', as: 'manager' });
User.hasMany(User, { foreignKey: 'managerId', as: 'teamMembers' });

Customer.belongsTo(User, { foreignKey: 'assignedAgentId', as: 'assignedAgent' });
User.hasMany(Customer, { foreignKey: 'assignedAgentId', as: 'customers' });

Call.belongsTo(Customer, { foreignKey: 'customerId' });
Customer.hasMany(Call, { foreignKey: 'customerId' });

Call.belongsTo(User, { foreignKey: 'agentId', as: 'agent' });
User.hasMany(Call, { foreignKey: 'agentId', as: 'calls' });

// Attachments and Status History associations
Call.hasMany(CallAttachment, { foreignKey: 'CallId', as: 'attachments' });
CallAttachment.belongsTo(Call, { foreignKey: 'CallId' });

Call.hasMany(CallStatusHistory, { foreignKey: 'CallId', as: 'statusHistory' });
CallStatusHistory.belongsTo(Call, { foreignKey: 'CallId' });

// Sync database. Alter only the Call table to avoid impacting other tables.
const ensureCallColumns = async () => {
  // MSSQL does not have native JSON type; use NVARCHAR(MAX) for JSON fields
  const sql = `
IF COL_LENGTH('dbo.Calls', 'orderId') IS NULL
  ALTER TABLE dbo.Calls ADD orderId NVARCHAR(255) NULL;

IF COL_LENGTH('dbo.Calls', 'category') IS NULL
  ALTER TABLE dbo.Calls ADD category NVARCHAR(255) NULL;

IF COL_LENGTH('dbo.Calls', 'orderDetails') IS NULL
  ALTER TABLE dbo.Calls ADD orderDetails NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.Calls', 'refundDetails') IS NULL
  ALTER TABLE dbo.Calls ADD refundDetails NVARCHAR(MAX) NULL;

IF COL_LENGTH('dbo.Calls', 'followUpRequired') IS NULL
BEGIN
  ALTER TABLE dbo.Calls ADD followUpRequired BIT NULL;
  UPDATE dbo.Calls SET followUpRequired = 0 WHERE followUpRequired IS NULL;
  ALTER TABLE dbo.Calls ALTER COLUMN followUpRequired BIT NOT NULL;
END

IF COL_LENGTH('dbo.Calls', 'followUpDate') IS NULL
  ALTER TABLE dbo.Calls ADD followUpDate DATETIME NULL;
`;
  try {
    await sequelize.query(sql);
    console.log('Ensured Calls columns exist');
  } catch (e) {
    console.error('Failed ensuring Calls columns:', e);
  }
};

const ensureSeedRoles = async () => {
  const sql = `
IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE name = 'Admin')
BEGIN
  INSERT INTO dbo.Roles (name, description, permissions, createdAt, updatedAt)
  VALUES ('Admin', 'Administrator role', '["manage_users","manage_roles","manage_customers","manage_calls","view_reports","system_config","data_export","data_import"]', GETDATE(), GETDATE());
END

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE name = 'Agent')
BEGIN
  INSERT INTO dbo.Roles (name, description, permissions, createdAt, updatedAt)
  VALUES ('Agent', 'Agent role', '["manage_calls","manage_customers","view_reports"]', GETDATE(), GETDATE());
END
`;
  try {
    await sequelize.query(sql);
    console.log('Ensured default Roles exist');
  } catch (e) {
    console.error('Failed ensuring default Roles:', e);
  }
};

const syncDatabase = async () => {
  try {
    await ensureCallColumns();
    await ensureSeedRoles();
    await sequelize.sync();
    console.log('Model sync complete (schema aligned)');
  } catch (error) {
    console.error('Model sync failed:', error);
  }
};

module.exports = {
  User,
  Role,
  Customer,
  Call,
  CallAttachment,
  CallStatusHistory,
  CustomerPortfolio,
  sequelize,
  syncDatabase
};