const User = require('./User');
const Role = require('./Role');
const Customer = require('./Customer');
const Call = require('./Call');
const { sequelize } = require('../config/db');
const CallAttachment = require('./CallAttachment');
const CallStatusHistory = require('./CallStatusHistory');

// Define associations
User.belongsTo(Role, { foreignKey: 'roleId' });
Role.hasMany(User, { foreignKey: 'roleId' });

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

// Sync models without altering existing schema (respect pre-deployed database)
const syncDatabase = async () => {
  try {
    await sequelize.sync();
    console.log('Model sync complete (no schema alter)');
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
  sequelize,
  syncDatabase
};