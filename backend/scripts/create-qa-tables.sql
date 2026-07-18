-- qa_audits: Stores imported QA audit records
IF OBJECT_ID('dbo.qa_audits', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.qa_audits (
    id INT IDENTITY(1,1) PRIMARY KEY,
    agent_name_raw NVARCHAR(255) NULL,
    agent_name_clean NVARCHAR(255) NULL,
    call_date NVARCHAR(100) NULL,
    lead_id NVARCHAR(100) NULL,
    customer_name NVARCHAR(255) NULL,
    mobile_number NVARCHAR(50) NULL,
    auditor_name NVARCHAR(255) NULL,
    campaign NVARCHAR(255) NULL,
    team NVARCHAR(255) NULL,
    greeting INT NULL DEFAULT 0,
    customer_concern INT NULL DEFAULT 0,
    probing_sales_pitch INT NULL DEFAULT 0,
    usp_given INT NULL DEFAULT 0,
    substitute_informed INT NULL DEFAULT 0,
    lab_info_shared INT NULL DEFAULT 0,
    followup_date_provided INT NULL DEFAULT 0,
    tone_confidence INT NULL DEFAULT 0,
    compliance_process INT NULL DEFAULT 0,
    qa_score NVARCHAR(50) NULL,
    remarks NVARCHAR(MAX) NULL,
    raw_data_json NVARCHAR(MAX) NULL,
    import_batch_id NVARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_qa_audits_created_at DEFAULT SYSUTCDATETIME()
  );
END
GO

-- qa_missing_points: Analyzed missing point flags per audit
IF OBJECT_ID('dbo.qa_missing_points', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.qa_missing_points (
    id INT IDENTITY(1,1) PRIMARY KEY,
    qa_audit_id INT NOT NULL,
    agent_name_clean NVARCHAR(255) NULL,
    category NVARCHAR(100) NOT NULL,
    is_missing BIT NOT NULL DEFAULT 0,
    source_field NVARCHAR(100) NULL,
    source_value NVARCHAR(MAX) NULL,
    severity NVARCHAR(20) NULL DEFAULT 'medium',
    created_at DATETIME2 NOT NULL CONSTRAINT DF_qa_missing_points_created_at DEFAULT SYSUTCDATETIME()
  );
END
GO

-- qa_agent_aliases: For merging duplicate agent names
IF OBJECT_ID('dbo.qa_agent_aliases', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.qa_agent_aliases (
    id INT IDENTITY(1,1) PRIMARY KEY,
    raw_agent_name NVARCHAR(255) NOT NULL,
    clean_agent_name NVARCHAR(255) NOT NULL,
    mapped_agent_name NVARCHAR(255) NOT NULL,
    created_by INT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_qa_agent_aliases_created_at DEFAULT SYSUTCDATETIME()
  );
END
GO

-- qa_report_config: Admin-configurable settings
IF OBJECT_ID('dbo.qa_report_config', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.qa_report_config (
    id INT IDENTITY(1,1) PRIMARY KEY,
    config_key NVARCHAR(100) NOT NULL UNIQUE,
    config_value_json NVARCHAR(MAX) NULL,
    updated_by INT NULL,
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_qa_report_config_updated_at DEFAULT SYSUTCDATETIME()
  );
END
GO

-- Indexes for qa_audits
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_qa_audits_agent_clean' AND object_id = OBJECT_ID('dbo.qa_audits'))
  CREATE INDEX IX_qa_audits_agent_clean ON dbo.qa_audits (agent_name_clean);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_qa_audits_call_date' AND object_id = OBJECT_ID('dbo.qa_audits'))
  CREATE INDEX IX_qa_audits_call_date ON dbo.qa_audits (call_date);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_qa_audits_campaign' AND object_id = OBJECT_ID('dbo.qa_audits'))
  CREATE INDEX IX_qa_audits_campaign ON dbo.qa_audits (campaign);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_qa_audits_team' AND object_id = OBJECT_ID('dbo.qa_audits'))
  CREATE INDEX IX_qa_audits_team ON dbo.qa_audits (team);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_qa_audits_auditor' AND object_id = OBJECT_ID('dbo.qa_audits'))
  CREATE INDEX IX_qa_audits_auditor ON dbo.qa_audits (auditor_name);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_qa_audits_import_batch' AND object_id = OBJECT_ID('dbo.qa_audits'))
  CREATE INDEX IX_qa_audits_import_batch ON dbo.qa_audits (import_batch_id);

-- Indexes for qa_missing_points
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_qa_mp_audit_id' AND object_id = OBJECT_ID('dbo.qa_missing_points'))
  CREATE INDEX IX_qa_mp_audit_id ON dbo.qa_missing_points (qa_audit_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_qa_mp_agent' AND object_id = OBJECT_ID('dbo.qa_missing_points'))
  CREATE INDEX IX_qa_mp_agent ON dbo.qa_missing_points (agent_name_clean);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_qa_mp_category' AND object_id = OBJECT_ID('dbo.qa_missing_points'))
  CREATE INDEX IX_qa_mp_category ON dbo.qa_missing_points (category);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_qa_mp_missing' AND object_id = OBJECT_ID('dbo.qa_missing_points'))
  CREATE INDEX IX_qa_mp_missing ON dbo.qa_missing_points (is_missing);
GO

-- Seed default negative keywords config
IF NOT EXISTS (SELECT 1 FROM dbo.qa_report_config WHERE config_key = 'negative_keywords')
BEGIN
  INSERT INTO dbo.qa_report_config (config_key, config_value_json, updated_at)
  VALUES ('negative_keywords', '["no","not done","not shared","not informed","missing","poor","incorrect","not proper","not provided","not mentioned","need improvement","low confidence","casual tone","rude","follow up not given","lab info not shared","substitute not informed","usp not given"]', SYSUTCDATETIME());
END

IF NOT EXISTS (SELECT 1 FROM dbo.qa_report_config WHERE config_key = 'blank_na_keywords')
BEGIN
  INSERT INTO dbo.qa_report_config (config_key, config_value_json, updated_at)
  VALUES ('blank_na_keywords', '["","na","n/a","not applicable","null","-"]', SYSUTCDATETIME());
END

IF NOT EXISTS (SELECT 1 FROM dbo.qa_report_config WHERE config_key = 'column_mapping')
BEGIN
  INSERT INTO dbo.qa_report_config (config_key, config_value_json, updated_at)
  VALUES ('column_mapping', '{"Agent Name":"agent_name","Call Date":"call_date","Lead ID":"lead_id","Customer Name":"customer_name","Mobile Number":"mobile_number","QA Auditor":"auditor_name","Campaign":"campaign","Team":"team","Greeting":"greeting","Customer Concern":"customer_concern","Probing / Sales Pitch":"probing_sales_pitch","USP":"usp_given","Substitute":"substitute_informed","Lab Info":"lab_info_shared","Follow Up":"followup_date_provided","Tone":"tone_confidence","QA Score":"qa_score","Remarks":"remarks"}', SYSUTCDATETIME());
END
GO
