const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Table to store portfolio uploads with customer metadata
const CustomerPortfolio = sequelize.define('CustomerPortfolio', {
  Id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  Mobile: { type: DataTypes.STRING(20), allowNull: false },
  GroupId: { type: DataTypes.STRING(50), allowNull: true },
  Name: { type: DataTypes.STRING(255), allowNull: true },
  Address: { type: DataTypes.STRING(500), allowNull: true },
  PinCode: { type: DataTypes.STRING(10), allowNull: true },
  SkuName: { type: DataTypes.STRING(255), allowNull: true },
  FileName: { type: DataTypes.STRING(255), allowNull: false },
  FilePath: { type: DataTypes.STRING(500), allowNull: false },
  UploadedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  UploadedBy: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'CustomerPortfolio',
  timestamps: false
});

module.exports = CustomerPortfolio;