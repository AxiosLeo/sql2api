-- Seed tables for sql2api model-module e2e tests
CREATE TABLE IF NOT EXISTS users (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  name VARCHAR(64) NOT NULL COMMENT 'Display name',
  email VARCHAR(128) NULL COMMENT 'Email',
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created at',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Users table';

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT NOT NULL COMMENT 'User id',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'Order amount',
  status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'Order status',
  PRIMARY KEY (id),
  KEY idx_orders_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Orders table';
