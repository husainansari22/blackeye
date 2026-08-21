-- Acctventa MySQL schema (Hostinger)
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
  password_hash VARCHAR(255) NOT NULL,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  escrow_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_deposits DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_withdrawals DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  plan VARCHAR(40) NOT NULL DEFAULT 'free',
  referral_code VARCHAR(60) NOT NULL DEFAULT '',
  referred_by VARCHAR(60) DEFAULT '',
  is_banned TINYINT(1) NOT NULL DEFAULT 0,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id VARCHAR(32) NOT NULL UNIQUE,
  listing_id INT UNSIGNED NULL,
  buyer_id INT UNSIGNED NOT NULL,
  seller_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  category VARCHAR(80) DEFAULT '',
  price DECIMAL(12,2) NOT NULL,
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
  type ENUM('deposit','withdrawal','sale','purchase','refund','commission') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payout DECIMAL(12,2) NULL,
  status ENUM('pending','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  method VARCHAR(60) DEFAULT '',
  note VARCHAR(500) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id),
  INDEX (type),
  INDEX (status),
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
('deposit_fee_rate', '0'),
('support_telegram', 'https://t.me/acctventa'),
('support_email', 'help@acctventa.com'),
('installed', '1')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
