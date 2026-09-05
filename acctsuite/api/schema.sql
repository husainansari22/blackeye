-- AcctSuite MySQL schema (Hostinger)
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(60) DEFAULT '',
  country_code VARCHAR(8) NOT NULL DEFAULT '',
  avatar_url VARCHAR(500) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  withdrawable_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  escrow_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_deposits DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_withdrawals DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  plan VARCHAR(40) NOT NULL DEFAULT 'free',
  payout_bank VARCHAR(120) NOT NULL DEFAULT '',
  payout_account VARCHAR(120) NOT NULL DEFAULT '',
  payout_account_name VARCHAR(120) NOT NULL DEFAULT '',
  payout_currency VARCHAR(10) NOT NULL DEFAULT '',
  payout_bank_locked TINYINT(1) NOT NULL DEFAULT 0,
  referral_code VARCHAR(60) NOT NULL DEFAULT '',
  referred_by VARCHAR(60) DEFAULT '',
  is_banned TINYINT(1) NOT NULL DEFAULT 0,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_seen_at DATETIME NULL,
  INDEX (referral_code),
  INDEX (plan)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS uploads_daily (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  day_key CHAR(10) NOT NULL,
  upload_count INT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY user_day (user_id, day_key),
  CONSTRAINT fk_uploads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ads (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  seller_id INT UNSIGNED NOT NULL,
  category VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  price DECIMAL(12,2) NOT NULL,
  release_type ENUM('auto','manual') NOT NULL DEFAULT 'auto',
  username VARCHAR(190) NOT NULL,
  password_plain VARCHAR(190) NOT NULL,
  preview_link VARCHAR(500) DEFAULT '',
  attached_email VARCHAR(190) DEFAULT '',
  attached_email_password VARCHAR(190) DEFAULT '',
  two_fa VARCHAR(190) DEFAULT '',
  extra_info TEXT,
  status ENUM('pending','active','denied','removed') NOT NULL DEFAULT 'pending',
  deny_reason VARCHAR(500) DEFAULT '',
  stock INT NOT NULL DEFAULT 1,
  reviewed_by VARCHAR(60) DEFAULT '',
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (status),
  INDEX (seller_id),
  CONSTRAINT fk_ads_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'needs_review',
  business_name VARCHAR(190) NOT NULL DEFAULT '',
  business_username VARCHAR(120) NOT NULL DEFAULT '',
  registration_number VARCHAR(120) NOT NULL DEFAULT '',
  business_type VARCHAR(80) NOT NULL DEFAULT '',
  industry VARCHAR(120) NOT NULL DEFAULT '',
  business_address TEXT,
  contact_person VARCHAR(190) NOT NULL DEFAULT '',
  contact_title VARCHAR(120) NOT NULL DEFAULT '',
  contact_email VARCHAR(190) NOT NULL DEFAULT '',
  contact_phone VARCHAR(60) NOT NULL DEFAULT '',
  owner_name VARCHAR(190) NOT NULL DEFAULT '',
  ownership_pct DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  owner_address TEXT,
  owner_dob VARCHAR(40) NOT NULL DEFAULT '',
  bank_account VARCHAR(80) NOT NULL DEFAULT '',
  bank_name VARCHAR(120) NOT NULL DEFAULT '',
  tax_id VARCHAR(80) NOT NULL DEFAULT '',
  doc_cac_url VARCHAR(500) NOT NULL DEFAULT '',
  doc_cac_name VARCHAR(190) NOT NULL DEFAULT '',
  doc_reg_url VARCHAR(500) NOT NULL DEFAULT '',
  doc_reg_name VARCHAR(190) NOT NULL DEFAULT '',
  doc_id_url VARCHAR(500) NOT NULL DEFAULT '',
  doc_id_name VARCHAR(190) NOT NULL DEFAULT '',
  doc_address_url VARCHAR(500) NOT NULL DEFAULT '',
  doc_address_name VARCHAR(190) NOT NULL DEFAULT '',
  ai_summary TEXT,
  ai_json MEDIUMTEXT,
  reject_reason VARCHAR(500) NOT NULL DEFAULT '',
  reviewed_by VARCHAR(80) NOT NULL DEFAULT '',
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (user_id),
  INDEX (status),
  CONSTRAINT fk_kyc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id VARCHAR(32) NOT NULL UNIQUE,
  listing_id INT UNSIGNED NULL,
  buyer_id INT UNSIGNED NOT NULL,
  seller_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(80) DEFAULT '',
  price DECIMAL(12,2) NOT NULL,
  platform_fee DECIMAL(12,2) NULL,
  seller_net DECIMAL(12,2) NULL,
  status ENUM('pending','completed','cancelled','disputed') NOT NULL DEFAULT 'pending',
  credentials_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  refunded_at DATETIME NULL,
  INDEX (buyer_id),
  INDEX (seller_id),
  INDEX (status),
  CONSTRAINT fk_orders_buyer FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  sender_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (order_id),
  CONSTRAINT fk_msg_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type ENUM('deposit','withdrawal','sale','purchase','refund','commission','plan') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payout DECIMAL(12,2) NULL,
  status ENUM('pending','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  method VARCHAR(60) DEFAULT '',
  note VARCHAR(500) DEFAULT '',
  reference VARCHAR(80) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id),
  INDEX (type),
  INDEX (status),
  INDEX (reference),
  CONSTRAINT fk_tx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(500) NOT NULL,
  type VARCHAR(40) DEFAULT 'info',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS support_threads (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  user_typing_at DATETIME NULL,
  staff_typing_at DATETIME NULL,
  user_last_seen_at DATETIME NULL,
  staff_last_seen_at DATETIME NULL,
  last_message_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_support_user (user_id),
  INDEX (status),
  INDEX (last_message_at),
  CONSTRAINT fk_st_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS support_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  thread_id INT UNSIGNED NOT NULL,
  sender_role ENUM('user','staff') NOT NULL,
  sender_id INT UNSIGNED NULL,
  staff_name VARCHAR(80) NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (thread_id),
  CONSTRAINT fk_sm_thread FOREIGN KEY (thread_id) REFERENCES support_threads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS staff_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  role VARCHAR(40) NOT NULL DEFAULT 'staff',
  staff_name VARCHAR(80) NOT NULL DEFAULT 'Support',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  INDEX (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS gateway_settings (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  deposit_provider VARCHAR(40) DEFAULT 'none',
  deposit_enabled TINYINT(1) DEFAULT 0,
  deposit_public_key TEXT,
  deposit_secret_key TEXT,
  deposit_webhook TEXT,
  deposit_notes TEXT,
  withdraw_provider VARCHAR(40) DEFAULT 'none',
  withdraw_enabled TINYINT(1) DEFAULT 0,
  withdraw_public_key TEXT,
  withdraw_secret_key TEXT,
  withdraw_webhook TEXT,
  withdraw_notes TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS plans (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  daily_uploads INT UNSIGNED NOT NULL DEFAULT 5,
  approval_label VARCHAR(120) DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_resets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (token_hash),
  INDEX (user_id),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO gateway_settings (id) VALUES (1)
  ON DUPLICATE KEY UPDATE id = id;

INSERT INTO plans (id, name, price, daily_uploads, approval_label) VALUES
('free', 'Free (Default)', 0, 5, 'Standard AI review'),
('basic', 'Basic', 9.99, 49, 'Basic upload approval'),
('business', 'Business', 19.99, 99, 'Priority upload approval'),
('pro', 'Pro', 29.99, 299, 'Fast upload approval')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO settings (setting_key, setting_value) VALUES
('min_deposit', '3'),
('min_withdraw', '5'),
('withdraw_commission_rate', '0.10'),
('sales_commission_rate', '0.22'),
('referral_reward_amount', '5'),
('referral_min_deposit', '50'),
('deposit_fee_rate', '0'),
('support_telegram', 'https://t.me/acctsuite'),
('support_email', 'support@acctsuite.com'),
('installed', '1')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
