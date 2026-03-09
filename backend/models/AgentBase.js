const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const AgentBase = sequelize.define('AgentBase', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  agentId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  lastOrderDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  followUpDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  customerPhone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  orderCount: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  customerName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  orderId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  payableAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  agentName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  team: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'AgentBase',
  timestamps: true,
  indexes: [
    { fields: ['agentId'] },
    { fields: ['customerPhone'] },
    { fields: ['agentName'] }
  ]
});

module.exports = AgentBase;
