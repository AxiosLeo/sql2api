/**
 * SQLite DDL constants and access stubs for the sql2api business database.
 * Real open/migrate/CRUD logic lands in a later iteration.
 */

export const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('mysql', 'postgresql')),
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  database TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
  UNIQUE(app_id, name)
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  comment TEXT DEFAULT '',
  columns_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE,
  UNIQUE(app_id, connection_id, table_name)
);

CREATE TABLE IF NOT EXISTS sqls (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  sql_text TEXT NOT NULL,
  sql_type TEXT NOT NULL CHECK(sql_type IN ('select', 'insert', 'update', 'delete')),
  method TEXT NOT NULL CHECK(method IN ('GET', 'POST', 'PATCH', 'DELETE')),
  params_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled', 'disabled')),
  review_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE,
  UNIQUE(app_id, name)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_app_id ON api_keys(app_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_token_hash ON api_keys(token_hash);
CREATE INDEX IF NOT EXISTS idx_connections_app_id ON connections(app_id);
CREATE INDEX IF NOT EXISTS idx_models_app_id ON models(app_id);
CREATE INDEX IF NOT EXISTS idx_models_connection_id ON models(connection_id);
CREATE INDEX IF NOT EXISTS idx_sqls_app_id ON sqls(app_id);
CREATE INDEX IF NOT EXISTS idx_sqls_connection_id ON sqls(connection_id);
`;

export interface AppRecord {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRecord {
  id: string;
  app_id: string;
  name: string;
  token_hash: string;
  prefix: string;
  status: 'active' | 'disabled';
  last_used_at: string | null;
  created_at: string;
}

/**
 * Open (or create) the SQLite database and run DDL migrations.
 * Stub: no-op. Real implementation uses better-sqlite3.
 */
export function getDB(): unknown {
  return null;
}

/**
 * Resolve an api-key plaintext to its owning app.
 * Stub: returns null (caller middleware treats missing key as 401).
 */
export async function resolveApiKey(_token: string): Promise<{ app_id: string; key_id: string } | null> {
  return null;
}
