const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Maps to table dbo.CallAttachments
const CallAttachment = sequelize.define('CallAttachment', {
  Id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  CallId: { type: DataTypes.INTEGER, allowNull: false },
  Type: { type: DataTypes.STRING(20), allowNull: false },
  FileName: { type: DataTypes.STRING(255), allowNull: false },
  FilePath: { type: DataTypes.STRING(500), allowNull: false },
  UploadedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  UploadedBy: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'CallAttachments',
  timestamps: false
});

module.exports = CallAttachment;