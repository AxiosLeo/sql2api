-- Seed tables for sql2api model-module e2e tests
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  email VARCHAR(128),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE users IS 'Users table';
COMMENT ON COLUMN users.id IS 'Primary key';
COMMENT ON COLUMN users.name IS 'Display name';
COMMENT ON COLUMN users.email IS 'Email';

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
);
COMMENT ON TABLE orders IS 'Orders table';
COMMENT ON COLUMN orders.id IS 'Primary key';
COMMENT ON COLUMN orders.user_id IS 'User id';
COMMENT ON COLUMN orders.amount IS 'Order amount';
COMMENT ON COLUMN orders.status IS 'Order status';
