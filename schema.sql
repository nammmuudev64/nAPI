-- Run this against your SQL Server instance.
-- sqlcmd -S "localhost,1433" -U sa -P "Admin@1234" -i schema.sql

-- ── Database ──────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'crud_db')
BEGIN
  CREATE DATABASE crud_db;
END
GO

USE crud_db;
GO

-- ── Users table ───────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'users' AND xtype = 'U')
BEGIN
  CREATE TABLE users (
    id                  INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
    name                NVARCHAR(100)  NOT NULL,
    email               NVARCHAR(150)  NOT NULL UNIQUE,
    password            NVARCHAR(255)  NOT NULL,
    role                NVARCHAR(20)   NOT NULL DEFAULT 'OtherUser'
                                       CHECK (role IN ('Admin', 'Employee', 'OtherUser')),
    age                 INT            NULL,
    image_url           NVARCHAR(500)  NULL,
    reset_token         NVARCHAR(500)  NULL,
    reset_token_expiry  DATETIME2      NULL,
    created_at          DATETIME2      NOT NULL DEFAULT GETDATE(),
    updated_at          DATETIME2      NOT NULL DEFAULT GETDATE()
  );
END
GO

-- ── Migrate: add missing columns to users if table already exists ─────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'password')
  ALTER TABLE users ADD password NVARCHAR(255) NOT NULL DEFAULT '';
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'role')
  ALTER TABLE users ADD role NVARCHAR(20) NOT NULL DEFAULT 'OtherUser'
    CHECK (role IN ('Admin', 'Employee', 'OtherUser'));
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'image_url')
  ALTER TABLE users ADD image_url NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'reset_token')
  ALTER TABLE users ADD reset_token NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'reset_token_expiry')
  ALTER TABLE users ADD reset_token_expiry DATETIME2 NULL;
GO

-- ── Employee Qualifications table ─────────────────────────────────────────────
-- user_id is a FOREIGN KEY referencing users(id)
-- One qualification record per user (UNIQUE constraint on user_id)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'employee_qualifications' AND xtype = 'U')
BEGIN
  CREATE TABLE employee_qualifications (
    id                INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,

    -- FK → users(id)  ── one record per user
    user_id           INT            NOT NULL UNIQUE
                                     REFERENCES users(id) ON DELETE CASCADE,

    -- Section 01: Employee Information (denormalised for convenience)
    department        NVARCHAR(100)  NOT NULL,
    designation       NVARCHAR(150)  NOT NULL,

    -- Section 02: Educational Background
    degree            NVARCHAR(100)  NOT NULL,
    specialization    NVARCHAR(150)  NOT NULL,
    institute         NVARCHAR(200)  NOT NULL,
    graduation_year   NVARCHAR(4)    NOT NULL,
    score_type        NVARCHAR(30)   NOT NULL,
    score             NVARCHAR(20)   NOT NULL,
    course_type       NVARCHAR(30)   NOT NULL DEFAULT 'Full-Time',

    -- Section 03: Professional Skills & Verification
    skills            NVARCHAR(500)  NULL,
    certifications    NVARCHAR(500)  NULL,
    experience_years  DECIMAL(4,1)   NULL,
    status            NVARCHAR(30)   NOT NULL DEFAULT 'Pending Verification'
                                     CHECK (status IN (
                                       'Pending Verification', 'Under Review', 'Verified'
                                     )),
    remarks           NVARCHAR(500)  NULL,

    -- Section 04: Resume
    resume_file_name  NVARCHAR(255)  NULL,
    resume_file_size  INT            NULL,
    resume_file_type  NVARCHAR(100)  NULL,
    resume_url        NVARCHAR(500)  NULL,

    created_at        DATETIME2      NOT NULL DEFAULT GETDATE(),
    updated_at        DATETIME2      NOT NULL DEFAULT GETDATE()
  );
END
GO

-- ── Migrate existing employee_qualifications table ────────────────────────────
-- Step 1: Add user_id column if missing (nullable first so existing rows are ok)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('employee_qualifications') AND name = 'user_id'
)
BEGIN
  ALTER TABLE employee_qualifications ADD user_id INT NULL;
END
GO

-- Step 2: Drop old string employee_id column if it still exists
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('employee_qualifications') AND name = 'employee_id'
)
BEGIN
  -- Drop ALL constraints (UQ, DEFAULT, CHECK) bound to the employee_id column.
  -- System-generated names like UQ__employee__C52E0BA9... don't contain the
  -- column name, so we look them up via sys.index_columns instead.
  DECLARE @sql NVARCHAR(MAX) = N'';

  -- Unique / Primary Key constraints
  SELECT @sql += N'ALTER TABLE employee_qualifications DROP CONSTRAINT [' + kc.name + N'];' + CHAR(13)
  FROM   sys.key_constraints kc
  JOIN   sys.index_columns   ic ON ic.object_id = kc.parent_object_id
                                AND ic.index_id  = kc.unique_index_id
  JOIN   sys.columns          c ON c.object_id   = ic.object_id
                                AND c.column_id   = ic.column_id
  WHERE  kc.parent_object_id = OBJECT_ID('employee_qualifications')
    AND  c.name = 'employee_id';

  -- Default constraints
  SELECT @sql += N'ALTER TABLE employee_qualifications DROP CONSTRAINT [' + dc.name + N'];' + CHAR(13)
  FROM   sys.default_constraints dc
  JOIN   sys.columns              c ON c.object_id  = dc.parent_object_id
                                   AND c.column_id  = dc.parent_column_id
  WHERE  dc.parent_object_id = OBJECT_ID('employee_qualifications')
    AND  c.name = 'employee_id';

  -- Check constraints
  SELECT @sql += N'ALTER TABLE employee_qualifications DROP CONSTRAINT [' + cc.name + N'];' + CHAR(13)
  FROM   sys.check_constraints cc
  JOIN   sys.columns            c ON c.object_id = cc.parent_object_id
                                 AND c.column_id = cc.parent_column_id
  WHERE  cc.parent_object_id = OBJECT_ID('employee_qualifications')
    AND  c.name = 'employee_id';

  -- Now drop all found constraints, then the column
  IF LEN(@sql) > 0 EXEC sp_executesql @sql;

  ALTER TABLE employee_qualifications DROP COLUMN employee_id;
END
GO

-- Step 3: Add missing columns
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('employee_qualifications') AND name = 'resume_url')
  ALTER TABLE employee_qualifications ADD resume_url NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('employee_qualifications') AND name = 'resume_file_name')
  ALTER TABLE employee_qualifications ADD resume_file_name NVARCHAR(255) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('employee_qualifications') AND name = 'resume_file_size')
  ALTER TABLE employee_qualifications ADD resume_file_size INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('employee_qualifications') AND name = 'resume_file_type')
  ALTER TABLE employee_qualifications ADD resume_file_type NVARCHAR(100) NULL;
GO

-- Step 4: Add FK and UNIQUE on user_id (only if not already there)
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE parent_object_id = OBJECT_ID('employee_qualifications')
    AND name = 'FK_eq_user_id'
)
BEGIN
  ALTER TABLE employee_qualifications
    ADD CONSTRAINT FK_eq_user_id
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.key_constraints
  WHERE parent_object_id = OBJECT_ID('employee_qualifications')
    AND name = 'UQ_eq_user_id'
)
BEGIN
  ALTER TABLE employee_qualifications
    ADD CONSTRAINT UQ_eq_user_id UNIQUE (user_id);
END
GO

-- ── Tasks table ───────────────────────────────────────────────────────────────
-- Many-to-many: a user can have many tasks, a task belongs to one owner (created_by)
-- and can optionally be assigned to another user (assigned_to).
-- Both are FKs → users(id).
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'tasks' AND xtype = 'U')
BEGIN
  CREATE TABLE tasks (
    id           INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,

    -- Task identity
    title        NVARCHAR(200)  NOT NULL,
    category     NVARCHAR(100)  NOT NULL DEFAULT 'General',
    done         BIT            NOT NULL DEFAULT 0,

    -- Ownership & assignment (FK → users)
    created_by   INT            NOT NULL
                                REFERENCES users(id) ON DELETE NO ACTION,
    assigned_to  INT            NULL
                                REFERENCES users(id) ON DELETE NO ACTION,

    created_at   DATETIME2      NOT NULL DEFAULT GETDATE(),
    updated_at   DATETIME2      NOT NULL DEFAULT GETDATE()
  );
END
GO

-- Migrate: add columns if table already exists
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('tasks') AND name = 'category')
  ALTER TABLE tasks ADD category NVARCHAR(100) NOT NULL DEFAULT 'General';
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('tasks') AND name = 'assigned_to')
  ALTER TABLE tasks ADD assigned_to INT NULL REFERENCES users(id) ON DELETE NO ACTION;
GO
