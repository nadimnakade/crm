const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Call = sequelize.define('Call', {
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  agentId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  orderId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  callType: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true
  },
  outcome: {
    type: DataTypes.STRING,
    allowNull: true
  },
  orderDetails: {
    type: DataTypes.JSON,
    allowNull: true
  },
  refundDetails: {
    type: DataTypes.JSON,
    allowNull: true
  },
  followUpRequired: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  followUpDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  reason: {
    type: DataTypes.STRING,
    allowNull: true
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  updatedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  resolvedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'Calls',
  indexes: [
    // Single-column indexes
    { fields: ['createdAt'] },
    { fields: ['date'] },
    { fields: ['orderId'] },
    { fields: ['agentId'] },
    { fields: ['outcome'] },
    { fields: ['followUpRequired'] },
    { fields: ['followUpDate'] },
    // Composite indexes for dashboard/report queries
    { fields: ['createdAt', 'orderId'] },
    { fields: ['createdAt', 'agentId'] },
    { fields: ['createdAt', 'outcome'] },
    { fields: ['date', 'agentId'] },
    { fields: ['date', 'orderId'] }
  ]
});

module.exports = Call;
