-- Create database if not exists
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'crm_db')
BEGIN
  CREATE DATABASE [crm_db];
END
GO
USE [crm_db];
GO

-- Create tables
IF OBJECT_ID('Roles', 'U') IS NULL
CREATE TABLE Roles (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(50) NOT NULL UNIQUE,
  description NVARCHAR(MAX),
  permissions NVARCHAR(MAX),
  createdAt DATETIME2 DEFAULT GETDATE(),
  updatedAt DATETIME2 DEFAULT GETDATE()
);

IF OBJECT_ID('Users', 'U') IS NULL
CREATE TABLE Users (
  id INT IDENTITY(1,1) PRIMARY KEY,
  username NVARCHAR(50) NOT NULL UNIQUE,
  email NVARCHAR(100) NOT NULL UNIQUE,
  password NVARCHAR(255) NOT NULL,
  firstName NVARCHAR(50) NOT NULL,
  lastName NVARCHAR(50) NOT NULL,
  roleId INT NOT NULL,
  phone NVARCHAR(20),
  isActive BIT DEFAULT 1,
  createdAt DATETIME2 DEFAULT GETDATE(),
  updatedAt DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (roleId) REFERENCES Roles(id)
);

IF OBJECT_ID('Customers', 'U') IS NULL
CREATE TABLE Customers (
  id INT IDENTITY(1,1) PRIMARY KEY,
  firstName NVARCHAR(50) NOT NULL,
  lastName NVARCHAR(50) NOT NULL,
  email NVARCHAR(100) UNIQUE,
  phone NVARCHAR(20),
  company NVARCHAR(100),
  address NVARCHAR(MAX),
  status NVARCHAR(20) DEFAULT 'active',
  assignedAgentId INT,
  notes NVARCHAR(MAX),
  createdAt DATETIME2 DEFAULT GETDATE(),
  updatedAt DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (assignedAgentId) REFERENCES Users(id)
);

IF OBJECT_ID('Calls', 'U') IS NULL
CREATE TABLE Calls (
  id INT IDENTITY(1,1) PRIMARY KEY,
  customerId INT NOT NULL,
  agentId INT NOT NULL,
  date DATETIME2 NOT NULL,
  duration INT,
  notes NVARCHAR(MAX),
  callType NVARCHAR(20) NOT NULL,
  outcome NVARCHAR(50),
  followUpRequired BIT DEFAULT 0,
  followUpDate DATETIME2,
  createdAt DATETIME2 DEFAULT GETDATE(),
  updatedAt DATETIME2 DEFAULT GETDATE(),
  FOREIGN KEY (customerId) REFERENCES Customers(id),
  FOREIGN KEY (agentId) REFERENCES Users(id)
);

-- Insert initial data
-- Roles
INSERT INTO Roles (name, description, permissions) VALUES
('SuperAdmin', 'Complete system control with all permissions', '["manage_users", "manage_roles", "manage_customers", "manage_calls", "view_reports", "system_config", "data_export", "data_import"]'),
('Admin', 'Full system access', '["manage_users", "manage_roles", "manage_customers", "manage_calls", "view_reports"]'),
('Manager', 'Manage team and view reports', '["manage_customers", "manage_calls", "view_reports"]'),
('Agent', 'Handle customer calls', '["view_customers", "manage_calls"]');

-- Admin user (password: admin123)
INSERT INTO Users (username, email, password, firstName, lastName, roleId, phone, isActive) VALUES
('superadmin', 'superadmin@crm.com', '$2a$10$N.1Utz9/ZJJRJRDjh7/AleKxGUKFI9OXVDWMlZjOAjZ9YlRKUJ5uO', 'Super', 'Admin', 1, '555-0000', 1),
('admin', 'admin@crm.com', '$2a$10$N.1Utz9/ZJJRJRDjh7/AleKxGUKFI9OXVDWMlZjOAjZ9YlRKUJ5uO', 'Admin', 'User', 2, '555-0100', 1);

-- Sample users (password: password123)
INSERT INTO Users (username, email, password, firstName, lastName, roleId, phone, isActive) VALUES
('manager', 'manager@crm.com', '$2a$10$xvXWkMAXIUlsLRxG5hQUJeOHKAEQnxN0PNsV3AJqnf8KV4MN7iRbe', 'John', 'Manager', 2, '555-0101', 1),
('agent1', 'agent1@crm.com', '$2a$10$xvXWkMAXIUlsLRxG5hQUJeOHKAEQnxN0PNsV3AJqnf8KV4MN7iRbe', 'Sarah', 'Smith', 3, '555-0102', 1),
('agent2', 'agent2@crm.com', '$2a$10$xvXWkMAXIUlsLRxG5hQUJeOHKAEQnxN0PNsV3AJqnf8KV4MN7iRbe', 'Mike', 'Johnson', 3, '555-0103', 1);

-- Sample customers
INSERT INTO Customers (firstName, lastName, email, phone, company, address, status, assignedAgentId, notes) VALUES
('Alice', 'Brown', 'alice@example.com', '555-1001', 'ABC Corp', '123 Main St, Anytown', 'active', 3, 'Interested in premium plan'),
('Bob', 'Wilson', 'bob@example.com', '555-1002', 'XYZ Inc', '456 Oak Ave, Somewhere', 'active', 3, 'Recently upgraded service'),
('Carol', 'Davis', 'carol@example.com', '555-1003', 'Acme Ltd', '789 Pine Rd, Nowhere', 'inactive', 4, 'Considering cancellation'),
('David', 'Miller', 'david@example.com', '555-1004', 'Global Co', '321 Elm Blvd, Anywhere', 'active', 4, 'New customer, needs follow-up');

-- Sample calls
INSERT INTO Calls (customerId, agentId, date, duration, notes, callType, outcome, followUpRequired, followUpDate) VALUES
(1, 3, DATEADD(day, -5, GETDATE()), 360, 'Discussed new features', 'outbound', 'positive', 0, NULL),
(2, 3, DATEADD(day, -3, GETDATE()), 240, 'Resolved billing issue', 'inbound', 'resolved', 0, NULL),
(3, 4, DATEADD(day, -2, GETDATE()), 480, 'Addressed concerns about service', 'outbound', 'neutral', 1, DATEADD(day, 7, GETDATE())),
(4, 4, DATEADD(day, -1, GETDATE()), 300, 'Introduction call', 'outbound', 'positive', 1, DATEADD(day, 3, GETDATE())),
(1, 3, GETDATE(), 420, 'Follow-up on new features', 'outbound', 'positive', 0, NULL);

-- Ensure phone is NOT NULL and UNIQUE on Customers
IF COL_LENGTH('Customers', 'phone') IS NOT NULL
BEGIN
  BEGIN TRY
    ALTER TABLE Customers ALTER COLUMN phone NVARCHAR(20) NOT NULL;
  END TRY
  BEGIN CATCH
    PRINT 'Skipping NOT NULL alteration for Customers.phone due to existing data or permissions.';
  END CATCH
END

IF NOT EXISTS (
  SELECT 1 FROM sys.key_constraints kc
  WHERE kc.[type] = 'UQ' AND kc.[name] = 'UQ_Customers_Phone' AND kc.[parent_object_id] = OBJECT_ID('Customers')
)
BEGIN
  BEGIN TRY
    ALTER TABLE Customers ADD CONSTRAINT UQ_Customers_Phone UNIQUE (phone);
  END TRY
  BEGIN CATCH
    PRINT 'Skipping UNIQUE constraint creation for Customers.phone.';
  END CATCH
END