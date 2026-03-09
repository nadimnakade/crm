const User = require('./User');
const Role = require('./Role');
const Customer = require('./Customer');
const Call = require('./Call');
const CallAttachment = require('./CallAttachment');
const CustomerPortfolio = require('./CustomerPortfolio');
const CallStatusHistory = require('./CallStatusHistory');
const Session = require('./Session');
const AgentBase = require('./AgentBase');
const { sequelize } = require('../config/db');

// Define associations
User.belongsTo(Role, { foreignKey: 'roleId' });
Role.hasMany(User, { foreignKey: 'roleId' });

// Manager → Agents relationship
User.belongsTo(User, { foreignKey: 'managerId', as: 'manager' });
User.hasMany(User, { foreignKey: 'managerId', as: 'teamMembers' });

// AgentBase → User
AgentBase.belongsTo(User, { foreignKey: 'agentId', as: 'agent' });
User.hasMany(AgentBase, { foreignKey: 'agentId', as: 'agentBase' });

// Removed assignedAgentId relationship due to column removal from Customers table

Call.belongsTo(Customer, { foreignKey: 'customerId' });
Customer.hasMany(Call, { foreignKey: 'customerId' });

Call.belongsTo(User, { foreignKey: 'agentId', as: 'agent' });
User.hasMany(Call, { foreignKey: 'agentId', as: 'calls' });

// Attachments and Status History associations
Call.hasMany(CallAttachment, { foreignKey: 'CallId', as: 'attachments' });
CallAttachment.belongsTo(Call, { foreignKey: 'CallId' });

Call.hasMany(CallStatusHistory, { foreignKey: 'CallId', as: 'statusHistory' });
CallStatusHistory.belongsTo(Call, { foreignKey: 'CallId' });

// Session associations
User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
Session.belongsTo(User, { foreignKey: 'userId' });

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
`;
  try {
    await sequelize.query(sql);
    console.log('Ensured Calls columns exist');
  } catch (e) {
    console.error('Failed ensuring Calls columns:', e);
  }
};

const ensureUserColumns = async () => {
  const sql = `
IF COL_LENGTH('dbo.Users', 'lastLogin') IS NULL
  ALTER TABLE dbo.Users ADD lastLogin DATETIME2 NULL;
`;
  try {
    await sequelize.query(sql);
    console.log('Ensured Users columns exist');
  } catch (e) {
    console.error('Failed ensuring Users columns:', e);
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

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE name = 'Orders Viewer')
BEGIN
  INSERT INTO dbo.Roles (name, description, permissions, createdAt, updatedAt)
  VALUES ('Orders Viewer', 'Can view Customers and Orders reports only', '["view_customers","view_reports_orders"]', GETDATE(), GETDATE());
END
`;
  try {
    await sequelize.query(sql);
    console.log('Ensured default Roles exist');
  } catch (e) {
    console.error('Failed ensuring default Roles:', e);
  }
};

// Create helpful indexes for Customers to speed up search and counts
const ensureCustomerIndexes = async () => {
  const sql = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_Phone' AND object_id = OBJECT_ID('dbo.Customers')
)
BEGIN
  CREATE INDEX IX_Customers_Phone ON dbo.Customers (phone);
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_Status' AND object_id = OBJECT_ID('dbo.Customers')
)
BEGIN
  CREATE INDEX IX_Customers_Status ON dbo.Customers (status);
END

IF NOT EXISTS (
  SELECT 1 FROM sys.columns WHERE Name = N'PhoneDigits' AND Object_ID = Object_ID(N'dbo.Customers')
)
BEGIN
  ALTER TABLE dbo.Customers
  ADD PhoneDigits AS (
    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '')
  ) PERSISTED;
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = 'IX_Customers_PhoneDigits' AND object_id = OBJECT_ID('dbo.Customers')
)
BEGIN
  CREATE INDEX IX_Customers_PhoneDigits ON dbo.Customers (PhoneDigits);
END
`;
  try {
    await sequelize.query(sql);
    console.log('Ensured Customers indexes exist');
  } catch (e) {
    console.error('Failed ensuring Customers indexes:', e);
  }
};

// Create helpful indexes for Calls to speed up followups and agent filters
const ensureCallIndexes = async () => {
  const sql = `
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = 'IX_Calls_FollowUpDate' AND object_id = OBJECT_ID('dbo.Calls')
)
BEGIN
  CREATE INDEX IX_Calls_FollowUpDate ON dbo.Calls (followUpDate);
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = 'IX_Calls_AgentId' AND object_id = OBJECT_ID('dbo.Calls')
)
BEGIN
  CREATE INDEX IX_Calls_AgentId ON dbo.Calls (agentId);
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = 'IX_Calls_AgentId_FollowUpDate' AND object_id = OBJECT_ID('dbo.Calls')
)
BEGIN
  CREATE INDEX IX_Calls_AgentId_FollowUpDate ON dbo.Calls (agentId, followUpDate);
END

-- CreatedAt and HasOrder performance helpers for Recent Orders
IF NOT EXISTS (
  SELECT 1 FROM sys.columns WHERE Name = N'HasOrder' AND Object_ID = Object_ID(N'dbo.Calls')
)
BEGIN
  ALTER TABLE dbo.Calls ADD HasOrder AS (
    CASE WHEN orderDetails IS NOT NULL OR orderId IS NOT NULL THEN 1 ELSE 0 END
  ) PERSISTED;
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = 'IX_Calls_CreatedAt' AND object_id = OBJECT_ID('dbo.Calls')
)
BEGIN
  CREATE INDEX IX_Calls_CreatedAt ON dbo.Calls (createdAt);
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = 'IX_Calls_AgentId_CreatedAt' AND object_id = OBJECT_ID('dbo.Calls')
)
BEGIN
  CREATE INDEX IX_Calls_AgentId_CreatedAt ON dbo.Calls (agentId, createdAt);
END

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = 'IX_Calls_HasOrder_CreatedAt' AND object_id = OBJECT_ID('dbo.Calls')
)
BEGIN
  CREATE INDEX IX_Calls_HasOrder_CreatedAt ON dbo.Calls (HasOrder, createdAt);
END
`;
  try {
    await sequelize.query(sql);
    console.log('Ensured Calls indexes exist');
  } catch (e) {
    console.error('Failed ensuring Calls indexes:', e);
  }
};

const syncDatabase = async () => {
  try {
    await ensureCallColumns();
    await ensureUserColumns();
    await ensureSeedRoles();
    await ensureCustomerIndexes();
    await ensureCallIndexes();
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
  Session,
  AgentBase,
  sequelize,
  syncDatabase
};
