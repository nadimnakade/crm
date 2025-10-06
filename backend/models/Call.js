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
  outcome: {
    type: DataTypes.STRING,
    allowNull: true
  },
  followUpRequired: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  followUpDate: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  timestamps: true
});

module.exports = Call;