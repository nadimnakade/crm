const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Maps to table dbo.CallStatusHistory
const CallStatusHistory = sequelize.define('CallStatusHistory', {
  Id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  CallId: { type: DataTypes.INTEGER, allowNull: false },
  PreviousStatus: { type: DataTypes.STRING(50), allowNull: true },
  NewStatus: { type: DataTypes.STRING(50), allowNull: false },
  ChangedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  ChangedBy: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'CallStatusHistory',
  timestamps: false
});

module.exports = CallStatusHistory;