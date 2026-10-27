-- ============================================================
--  اسکیمای رسمی فاکتوریزم — MySQL 8.0 / MariaDB 10.6+
--  موتور InnoDB، مجموعه کاراکتر فارسی utf8mb4
--  اجرا: mysql -u root -p < server/src/db/schema.sql
-- ============================================================
CREATE DATABASE IF NOT EXISTS faktorizm
  CHARACTER SET utf8mb4 COLLATE utf8mb4_persian_ci;
USE faktorizm;

CREATE TABLE IF NOT EXISTS workspaces (
  id             VARCHAR(40)  NOT NULL PRIMARY KEY,
  name           VARCHAR(160) NOT NULL,
  license_expires_at DATETIME NULL,
  trial_ends_at  DATETIME     NULL,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id                   VARCHAR(40)  NOT NULL PRIMARY KEY,
  workspace_id         VARCHAR(40)  NOT NULL,
  name                 VARCHAR(120) NOT NULL,
  email                VARCHAR(180) NOT NULL UNIQUE,
  phone                VARCHAR(20)  NULL,
  password_hash        VARCHAR(100) NOT NULL,
  role                 ENUM('owner','admin','accountant','operator','viewer') NOT NULL DEFAULT 'viewer',
  totp_secret          VARCHAR(64)  NULL,
  totp_enabled         TINYINT(1)   NOT NULL DEFAULT 0,
  failed_attempts      INT          NOT NULL DEFAULT 0,
  locked_until         DATETIME(3)  NULL,
  suspended            TINYINT(1)   NOT NULL DEFAULT 0,
  must_change_password TINYINT(1)   NOT NULL DEFAULT 0,
  created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_users_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  INDEX idx_users_workspace (workspace_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id            VARCHAR(40)  NOT NULL PRIMARY KEY,
  user_id       VARCHAR(40)  NOT NULL,
  family_id     VARCHAR(40)  NOT NULL,
  token_hash    CHAR(64)     NOT NULL UNIQUE,
  user_agent    VARCHAR(240) NULL,
  expires_at    DATETIME(3)  NOT NULL,
  revoked_at    DATETIME(3)  NULL,
  last_used_at  DATETIME(3)  NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_rt_family (family_id),
  INDEX idx_rt_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_resets (
  id         VARCHAR(40) NOT NULL PRIMARY KEY,
  user_id    VARCHAR(40) NOT NULL,
  token_hash CHAR(64)    NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at    DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS plans (
  id            VARCHAR(40)  NOT NULL PRIMARY KEY,
  code          VARCHAR(40)  NOT NULL UNIQUE,
  name          VARCHAR(120) NOT NULL,
  duration_days INT          NOT NULL,
  price_toman   BIGINT       NOT NULL DEFAULT 0,
  sort_order    INT          NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS licenses (
  id              VARCHAR(40)  NOT NULL PRIMARY KEY,
  workspace_id    VARCHAR(40)  NULL,
  plan_id         VARCHAR(40)  NOT NULL,
  batch_id        VARCHAR(40)  NOT NULL,
  code_hash       CHAR(64)     NOT NULL UNIQUE,
  code_last4      CHAR(4)      NOT NULL,
  duration_days   INT          NOT NULL,
  status          ENUM('unused','redeemed','revoked') NOT NULL DEFAULT 'unused',
  redeemed_by     VARCHAR(40)  NULL,
  redeemed_at     DATETIME(3)  NULL,
  expires_at      DATETIME(3)  NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_lic_plan FOREIGN KEY (plan_id) REFERENCES plans(id),
  CONSTRAINT fk_lic_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL,
  INDEX idx_lic_status (status),
  INDEX idx_lic_workspace (workspace_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tickets (
  id          VARCHAR(40)  NOT NULL PRIMARY KEY,
  workspace_id VARCHAR(40) NOT NULL,
  subject     VARCHAR(200) NOT NULL,
  priority    ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  status      ENUM('open','answered','closed') NOT NULL DEFAULT 'open',
  created_by  VARCHAR(40)  NOT NULL,
  assigned_to VARCHAR(40)  NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_tk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  INDEX idx_tk_workspace (workspace_id),
  INDEX idx_tk_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ticket_messages (
  id         VARCHAR(40)  NOT NULL PRIMARY KEY,
  ticket_id  VARCHAR(40)  NOT NULL,
  author_id  VARCHAR(40)  NOT NULL,
  body       TEXT         NOT NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_tm_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  INDEX idx_tm_ticket (ticket_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id           VARCHAR(40) NOT NULL PRIMARY KEY,
  workspace_id VARCHAR(40) NULL,
  user_id      VARCHAR(40) NULL,
  event        VARCHAR(80) NOT NULL,
  ip           VARCHAR(64) NULL,
  meta         JSON        NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_workspace (workspace_id),
  INDEX idx_audit_event (event),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoices (
  id           VARCHAR(40) NOT NULL PRIMARY KEY,
  workspace_id VARCHAR(40) NOT NULL,
  number       VARCHAR(60) NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'draft',
  total        BIGINT      NOT NULL DEFAULT 0,
  doc_date     VARCHAR(20) NULL,
  payload      JSON        NOT NULL,
  deleted_at   DATETIME(3) NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_invoice_workspace (workspace_id, id),
  INDEX idx_inv_workspace (workspace_id),
  INDEX idx_inv_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS contacts (
  id           VARCHAR(40) NOT NULL PRIMARY KEY,
  workspace_id VARCHAR(40) NOT NULL,
  name         VARCHAR(160) NOT NULL,
  payload      JSON        NOT NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_ct_workspace (workspace_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id           VARCHAR(40) NOT NULL PRIMARY KEY,
  workspace_id VARCHAR(40) NOT NULL,
  title        VARCHAR(200) NOT NULL,
  payload      JSON        NOT NULL,
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_pr_workspace (workspace_id)
) ENGINE=InnoDB;
