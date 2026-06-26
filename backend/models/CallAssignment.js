const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CallAssignment = sequelize.define('CallAssignment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  CallId: { type: DataTypes.INTEGER, allowNull: false },
  AgentId: { type: DataTypes.INTEGER, allowNull: false },
  AssignedBy: { type: DataTypes.INTEGER, allowNull: true },
  AssignedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  IsResolved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  ResolvedBy: { type: DataTypes.INTEGER, allowNull: true },
  ResolvedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'CallAssignments',
  timestamps: true,
  indexes: [
    { fields: ['CallId'] },
    { fields: ['AgentId'] },
    { fields: ['IsResolved'] },
    { unique: true, fields: ['CallId', 'AgentId'] }
  ]
});

module.exports = CallAssignment;
