import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import config from '../config';
import type {
  DatasourceType,
  EntityStatus,
  HttpMethod,
  PaginatedResult,
  ReviewResult,
  SqlParamDef,
  SqlStatus,
  SqlType,
  ColumnDefinition
} from '../types';
import type { DatasourceConfig } from './datasource';

/**
 * SQLite DDL for the sql2api business database.
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
  status: EntityStatus;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRecord {
  id: string;
  app_id: string;
  name: string;
  token_hash: string;
  prefix: string;
  status: EntityStatus;
  last_used_at: string | null;
  created_at: string;
}

export interface ConnectionRecord {
  id: string;
  app_id: string;
  name: string;
  type: DatasourceType;
  host: string;
  port: number;
  username: string;
  password_enc: string;
  database: string;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
}

export interface ModelRecord {
  id: string;
  app_id: string;
  connection_id: string;
  table_name: string;
  comment: string;
  columns_json: string;
  created_at: string;
  updated_at: string;
}

export interface SqlRecord {
  id: string;
  app_id: string;
  connection_id: string;
  name: string;
  description: string;
  sql_text: string;
  sql_type: SqlType;
  method: HttpMethod;
  params_json: string;
  status: SqlStatus;
  review_json: string;
  created_at: string;
  updated_at: string;
}

export interface CreateConnectionInput {
  app_id: string;
  name: string;
  type: DatasourceType;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export interface UpdateConnectionInput {
  name?: string;
  type?: DatasourceType;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  status?: EntityStatus;
}

export interface UpsertModelInput {
  app_id: string;
  connection_id: string;
  table_name: string;
  comment?: string;
  columns: ColumnDefinition[];
}

export interface CreateSqlInput {
  app_id: string;
  connection_id: string;
  name: string;
  description?: string;
  sql_text: string;
  sql_type: SqlType;
  method: HttpMethod;
  params?: SqlParamDef[];
  review?: ReviewResult;
  status?: SqlStatus;
}

export interface UpdateSqlInput {
  connection_id?: string;
  name?: string;
  description?: string;
  sql_text?: string;
  sql_type?: SqlType;
  method?: HttpMethod;
  params?: SqlParamDef[];
  review?: ReviewResult;
  status?: SqlStatus;
}

export interface ListOptions {
  page?: number;
  size?: number;
  keyword?: string;
  connection_id?: string;
  sql_type?: SqlType;
}

let dbInstance: Database.Database | null = null;
let dbPathResolved: string | null = null;

function nowISO(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function resolveDbPath(): string {
  const raw = process.env.SQLITE_PATH || config.envs.sqlite.path;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function getSecretKey(): Buffer {
  const secret = process.env.APP_SECRET || config.envs.app.secret;
  return crypto.createHash('sha256').update(secret).digest();
}

/** AES-256-GCM encrypt; storage format `iv:authTag:cipher` (base64). */
export function encryptPassword(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/** Decrypt a password produced by encryptPassword. */
export function decryptPassword(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted password format');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getSecretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Open (or create) the SQLite database and run DDL migrations.
 * Singleton per process; path resolved from SQLITE_PATH / config.
 */
export function getDB(): Database.Database {
  const resolved = resolveDbPath();
  if (dbInstance && dbPathResolved === resolved) {
    return dbInstance;
  }
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SQLITE_DDL);

  dbInstance = db;
  dbPathResolved = resolved;
  return db;
}

/** Close singleton DB — used by tests. */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPathResolved = null;
  }
}

// ─── apps ───────────────────────────────────────────────────────────────────

export function createApp(name: string, description = ''): AppRecord {
  const db = getDB();
  const now = nowISO();
  const row: AppRecord = {
    id: newId(),
    name,
    description,
    status: 'active',
    created_at: now,
    updated_at: now
  };
  db.prepare(
    `INSERT INTO apps (id, name, description, status, created_at, updated_at)
     VALUES (@id, @name, @description, @status, @created_at, @updated_at)`
  ).run(row);
  return row;
}

export function listApps(): AppRecord[] {
  return getDB().prepare('SELECT * FROM apps ORDER BY created_at DESC').all() as AppRecord[];
}

export function getApp(id: string): AppRecord | null {
  return (getDB().prepare('SELECT * FROM apps WHERE id = ?').get(id) as AppRecord | undefined) || null;
}

export function getAppByName(name: string): AppRecord | null {
  return (getDB().prepare('SELECT * FROM apps WHERE name = ?').get(name) as AppRecord | undefined) || null;
}

export function removeApp(id: string): boolean {
  const result = getDB().prepare('DELETE FROM apps WHERE id = ?').run(id);
  return result.changes > 0;
}

// ─── api_keys ───────────────────────────────────────────────────────────────

export function createApiKey(
  app_id: string,
  name = 'default'
): { record: ApiKeyRecord; token: string } {
  const app = getApp(app_id);
  if (!app) {
    throw new Error(`App not found: ${app_id}`);
  }

  const token = `sk2a_${crypto.randomBytes(20).toString('hex')}`;
  const record: ApiKeyRecord = {
    id: newId(),
    app_id,
    name,
    token_hash: hashToken(token),
    prefix: token.slice(0, 12),
    status: 'active',
    last_used_at: null,
    created_at: nowISO()
  };

  getDB().prepare(
    `INSERT INTO api_keys (id, app_id, name, token_hash, prefix, status, last_used_at, created_at)
     VALUES (@id, @app_id, @name, @token_hash, @prefix, @status, @last_used_at, @created_at)`
  ).run(record);

  return { record, token };
}

export function listApiKeys(app_id: string): ApiKeyRecord[] {
  return getDB()
    .prepare('SELECT * FROM api_keys WHERE app_id = ? ORDER BY created_at DESC')
    .all(app_id) as ApiKeyRecord[];
}

export function revokeApiKey(id: string): boolean {
  const result = getDB()
    .prepare(`UPDATE api_keys SET status = 'disabled' WHERE id = ?`)
    .run(id);
  return result.changes > 0;
}

/**
 * Resolve an api-key plaintext to its owning app.
 * Validates both key and app are active; updates last_used_at.
 */
export async function resolveApiKey(
  token: string
): Promise<{ app_id: string; key_id: string } | null> {
  if (!token) {
    return null;
  }
  const db = getDB();
  const key = db
    .prepare('SELECT * FROM api_keys WHERE token_hash = ?')
    .get(hashToken(token)) as ApiKeyRecord | undefined;

  if (!key || key.status !== 'active') {
    return null;
  }

  const app = getApp(key.app_id);
  if (!app || app.status !== 'active') {
    return null;
  }

  db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(nowISO(), key.id);
  return { app_id: key.app_id, key_id: key.id };
}

// ─── connections ────────────────────────────────────────────────────────────

export function createConnection(input: CreateConnectionInput): ConnectionRecord {
  const now = nowISO();
  const row: ConnectionRecord = {
    id: newId(),
    app_id: input.app_id,
    name: input.name,
    type: input.type,
    host: input.host,
    port: input.port,
    username: input.username,
    password_enc: encryptPassword(input.password),
    database: input.database,
    status: 'active',
    created_at: now,
    updated_at: now
  };
  getDB().prepare(
    `INSERT INTO connections
     (id, app_id, name, type, host, port, username, password_enc, database, status, created_at, updated_at)
     VALUES
     (@id, @app_id, @name, @type, @host, @port, @username, @password_enc, @database, @status, @created_at, @updated_at)`
  ).run(row);
  return row;
}

export function listConnections(
  app_id: string,
  options: ListOptions = {}
): PaginatedResult<ConnectionRecord> {
  const page = options.page && options.page > 0 ? options.page : 1;
  const size = options.size && options.size > 0 ? Math.min(options.size, 100) : 20;
  const offset = (page - 1) * size;

  const params: unknown[] = [app_id];
  let where = 'app_id = ?';
  if (options.keyword) {
    where += ' AND name LIKE ?';
    params.push(`%${options.keyword}%`);
  }

  const db = getDB();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM connections WHERE ${where}`).get(...params) as { c: number }).c;
  const list = db
    .prepare(`SELECT * FROM connections WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, size, offset) as ConnectionRecord[];

  return { list, total, page, size };
}

export function getConnection(app_id: string, id: string): ConnectionRecord | null {
  return (
    (getDB()
      .prepare('SELECT * FROM connections WHERE id = ? AND app_id = ?')
      .get(id, app_id) as ConnectionRecord | undefined) || null
  );
}

/** Decrypt password and return a DatasourceConfig for the datasource layer. */
export function getConnectionConfig(app_id: string, id: string): DatasourceConfig | null {
  const row = getConnection(app_id, id);
  if (!row) {
    return null;
  }
  return {
    type: row.type,
    host: row.host,
    port: row.port,
    username: row.username,
    password: decryptPassword(row.password_enc),
    database: row.database
  };
}

export function updateConnection(
  app_id: string,
  id: string,
  input: UpdateConnectionInput
): ConnectionRecord | null {
  const existing = getConnection(app_id, id);
  if (!existing) {
    return null;
  }

  const updated: ConnectionRecord = {
    ...existing,
    name: input.name ?? existing.name,
    type: input.type ?? existing.type,
    host: input.host ?? existing.host,
    port: input.port ?? existing.port,
    username: input.username ?? existing.username,
    password_enc: input.password !== undefined
      ? encryptPassword(input.password)
      : existing.password_enc,
    database: input.database ?? existing.database,
    status: input.status ?? existing.status,
    updated_at: nowISO()
  };

  getDB().prepare(
    `UPDATE connections SET
       name = @name, type = @type, host = @host, port = @port,
       username = @username, password_enc = @password_enc, database = @database,
       status = @status, updated_at = @updated_at
     WHERE id = @id AND app_id = @app_id`
  ).run(updated);

  return updated;
}

export function deleteConnection(app_id: string, id: string): boolean {
  const result = getDB()
    .prepare('DELETE FROM connections WHERE id = ? AND app_id = ?')
    .run(id, app_id);
  return result.changes > 0;
}

// ─── models ─────────────────────────────────────────────────────────────────

export function upsertModel(input: UpsertModelInput): ModelRecord {
  const db = getDB();
  const existing = db
    .prepare(
      'SELECT * FROM models WHERE app_id = ? AND connection_id = ? AND table_name = ?'
    )
    .get(input.app_id, input.connection_id, input.table_name) as ModelRecord | undefined;

  const now = nowISO();
  const columns_json = JSON.stringify(input.columns);

  if (existing) {
    const updated: ModelRecord = {
      ...existing,
      comment: input.comment ?? existing.comment,
      columns_json,
      updated_at: now
    };
    db.prepare(
      `UPDATE models SET comment = @comment, columns_json = @columns_json, updated_at = @updated_at
       WHERE id = @id`
    ).run(updated);
    return updated;
  }

  const row: ModelRecord = {
    id: newId(),
    app_id: input.app_id,
    connection_id: input.connection_id,
    table_name: input.table_name,
    comment: input.comment || '',
    columns_json,
    created_at: now,
    updated_at: now
  };
  db.prepare(
    `INSERT INTO models
     (id, app_id, connection_id, table_name, comment, columns_json, created_at, updated_at)
     VALUES
     (@id, @app_id, @connection_id, @table_name, @comment, @columns_json, @created_at, @updated_at)`
  ).run(row);
  return row;
}

export function listModels(
  app_id: string,
  options: ListOptions = {}
): PaginatedResult<ModelRecord> {
  const page = options.page && options.page > 0 ? options.page : 1;
  const size = options.size && options.size > 0 ? Math.min(options.size, 100) : 20;
  const offset = (page - 1) * size;

  const params: unknown[] = [app_id];
  let where = 'app_id = ?';
  if (options.connection_id) {
    where += ' AND connection_id = ?';
    params.push(options.connection_id);
  }
  if (options.keyword) {
    where += ' AND table_name LIKE ?';
    params.push(`%${options.keyword}%`);
  }

  const db = getDB();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM models WHERE ${where}`).get(...params) as { c: number }).c;
  const list = db
    .prepare(`SELECT * FROM models WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, size, offset) as ModelRecord[];

  return { list, total, page, size };
}

export function getModel(app_id: string, id: string): ModelRecord | null {
  return (
    (getDB()
      .prepare('SELECT * FROM models WHERE id = ? AND app_id = ?')
      .get(id, app_id) as ModelRecord | undefined) || null
  );
}

export function deleteModel(app_id: string, id: string): boolean {
  const result = getDB()
    .prepare('DELETE FROM models WHERE id = ? AND app_id = ?')
    .run(id, app_id);
  return result.changes > 0;
}

// ─── sqls ───────────────────────────────────────────────────────────────────

export function createSql(input: CreateSqlInput): SqlRecord {
  const now = nowISO();
  const row: SqlRecord = {
    id: newId(),
    app_id: input.app_id,
    connection_id: input.connection_id,
    name: input.name,
    description: input.description || '',
    sql_text: input.sql_text,
    sql_type: input.sql_type,
    method: input.method,
    params_json: JSON.stringify(input.params || []),
    status: input.status || 'enabled',
    review_json: JSON.stringify(input.review || { passed: true, issues: [] }),
    created_at: now,
    updated_at: now
  };
  getDB().prepare(
    `INSERT INTO sqls
     (id, app_id, connection_id, name, description, sql_text, sql_type, method,
      params_json, status, review_json, created_at, updated_at)
     VALUES
     (@id, @app_id, @connection_id, @name, @description, @sql_text, @sql_type, @method,
      @params_json, @status, @review_json, @created_at, @updated_at)`
  ).run(row);
  return row;
}

export function listSqls(
  app_id: string,
  options: ListOptions = {}
): PaginatedResult<SqlRecord> {
  const page = options.page && options.page > 0 ? options.page : 1;
  const size = options.size && options.size > 0 ? Math.min(options.size, 100) : 20;
  const offset = (page - 1) * size;

  const params: unknown[] = [app_id];
  let where = 'app_id = ?';
  if (options.connection_id) {
    where += ' AND connection_id = ?';
    params.push(options.connection_id);
  }
  if (options.sql_type) {
    where += ' AND sql_type = ?';
    params.push(options.sql_type);
  }
  if (options.keyword) {
    where += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${options.keyword}%`, `%${options.keyword}%`);
  }

  const db = getDB();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM sqls WHERE ${where}`).get(...params) as { c: number }).c;
  const list = db
    .prepare(`SELECT * FROM sqls WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, size, offset) as SqlRecord[];

  return { list, total, page, size };
}

export function getSql(app_id: string, id: string): SqlRecord | null {
  return (
    (getDB()
      .prepare('SELECT * FROM sqls WHERE id = ? AND app_id = ?')
      .get(id, app_id) as SqlRecord | undefined) || null
  );
}

export function updateSql(
  app_id: string,
  id: string,
  input: UpdateSqlInput
): SqlRecord | null {
  const existing = getSql(app_id, id);
  if (!existing) {
    return null;
  }

  const updated: SqlRecord = {
    ...existing,
    connection_id: input.connection_id ?? existing.connection_id,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    sql_text: input.sql_text ?? existing.sql_text,
    sql_type: input.sql_type ?? existing.sql_type,
    method: input.method ?? existing.method,
    params_json: input.params !== undefined
      ? JSON.stringify(input.params)
      : existing.params_json,
    review_json: input.review !== undefined
      ? JSON.stringify(input.review)
      : existing.review_json,
    status: input.status ?? existing.status,
    updated_at: nowISO()
  };

  getDB().prepare(
    `UPDATE sqls SET
       connection_id = @connection_id, name = @name, description = @description,
       sql_text = @sql_text, sql_type = @sql_type, method = @method,
       params_json = @params_json, review_json = @review_json,
       status = @status, updated_at = @updated_at
     WHERE id = @id AND app_id = @app_id`
  ).run(updated);

  return updated;
}

export function deleteSql(app_id: string, id: string): boolean {
  const result = getDB()
    .prepare('DELETE FROM sqls WHERE id = ? AND app_id = ?')
    .run(id, app_id);
  return result.changes > 0;
}
