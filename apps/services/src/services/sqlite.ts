import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
import { DATASOURCE_TYPES } from '../types';
import type { DatasourceConfig } from './datasource';

/** SQL fragment for connections.type CHECK constraint. */
const CONNECTIONS_TYPE_CHECK = DATASOURCE_TYPES.map((t) => `'${t}'`).join(', ');

/** Minimal sync SQLite surface shared by better-sqlite3 (Node) and bun:sqlite (Bun). */
interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

interface SqliteStatement {
  run(...params: unknown[]): SqliteRunResult;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  pragma(key: string): unknown;
  close(): void;
}

/**
 * bun:sqlite requires named-param object keys to include the SQL prefix
 * (`@id` / `$id` / `:id`). better-sqlite3 accepts bare keys (`id`).
 * Rewrite bare keys so existing `.run(row)` call sites keep working under Bun.
 */
function normalizeBunNamedParams(sql: string, params: unknown[]): unknown[] {
  if (
    params.length !== 1 ||
    params[0] === null ||
    typeof params[0] !== 'object' ||
    Array.isArray(params[0])
  ) {
    return params;
  }
  const obj = params[0] as Record<string, unknown>;
  const named = sql.match(/[@:$][A-Za-z_][A-Za-z0-9_]*/g);
  if (!named || named.length === 0) {
    return params;
  }
  const out: Record<string, unknown> = {};
  for (const full of named) {
    const bare = full.slice(1);
    if (Object.prototype.hasOwnProperty.call(obj, full)) {
      out[full] = obj[full];
    } else if (Object.prototype.hasOwnProperty.call(obj, bare)) {
      out[full] = obj[bare];
    }
  }
  return [out];
}

function wrapBunStatement(sql: string, stmt: SqliteStatement): SqliteStatement {
  return {
    run: (...params: unknown[]) => stmt.run(...normalizeBunNamedParams(sql, params)),
    get: (...params: unknown[]) => stmt.get(...normalizeBunNamedParams(sql, params)),
    all: (...params: unknown[]) => stmt.all(...normalizeBunNamedParams(sql, params))
  };
}

/**
 * Open a SQLite DB with the runtime-appropriate driver.
 * Bun does not support better-sqlite3 (V8 native addon); use bun:sqlite instead.
 */
function openDatabase(filepath: string): SqliteDatabase {
  if (typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined') {
    // Dynamic require keeps Node/tsc builds free of bun:sqlite types.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require('bun:sqlite') as {
      Database: new (filename: string, options?: { create?: boolean }) => {
        prepare(sql: string): SqliteStatement;
        exec(sql: string): void;
        close(): void;
      };
    };
    const db = new Database(filepath, { create: true });
    return {
      prepare: (sql) => wrapBunStatement(sql, db.prepare(sql)),
      exec: (sql) => {
        db.exec(sql);
      },
      pragma: (key) => {
        db.exec(`PRAGMA ${key}`);
        return undefined;
      },
      close: () => db.close()
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSqlite3 = require('better-sqlite3') as new (filename: string) => SqliteDatabase;
  return new BetterSqlite3(filepath);
}

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
  type TEXT NOT NULL CHECK(type IN (${CONNECTIONS_TYPE_CHECK})),
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
  sql_type TEXT NOT NULL CHECK(sql_type IN ('select', 'insert', 'update', 'complex')),
  method TEXT NOT NULL CHECK(method IN ('GET', 'POST', 'PATCH')),
  params_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled', 'disabled', 'draft')),
  review_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE,
  UNIQUE(app_id, name)
);

CREATE TABLE IF NOT EXISTS invoke_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL,
  sql_id TEXT NOT NULL,
  connection_id TEXT,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  success INTEGER NOT NULL,
  error_message TEXT,
  latency_ms INTEGER NOT NULL,
  row_count INTEGER,
  params TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta_tables (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
  UNIQUE(app_id, name)
);

CREATE TABLE IF NOT EXISTS meta_fields (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN (
    'text', 'number', 'single_select', 'multi_select', 'datetime',
    'created_by', 'updated_by', 'created_at', 'updated_at',
    'one_way_link', 'two_way_link', 'parent_record', 'attachment'
  )),
  validator TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  is_system INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (table_id) REFERENCES meta_tables(id) ON DELETE CASCADE,
  UNIQUE(table_id, name)
);

CREATE TABLE IF NOT EXISTS meta_shards (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  shard_no INTEGER NOT NULL,
  physical_table TEXT NOT NULL UNIQUE,
  row_count INTEGER NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 100000,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'sealed')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (table_id) REFERENCES meta_tables(id) ON DELETE CASCADE,
  UNIQUE(table_id, shard_no)
);

CREATE TABLE IF NOT EXISTS meta_record_index (
  record_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  table_id TEXT NOT NULL,
  shard_id TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
  FOREIGN KEY (table_id) REFERENCES meta_tables(id) ON DELETE CASCADE,
  FOREIGN KEY (shard_id) REFERENCES meta_shards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_app_id ON api_keys(app_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_token_hash ON api_keys(token_hash);
CREATE INDEX IF NOT EXISTS idx_connections_app_id ON connections(app_id);
CREATE INDEX IF NOT EXISTS idx_models_app_id ON models(app_id);
CREATE INDEX IF NOT EXISTS idx_models_connection_id ON models(connection_id);
CREATE INDEX IF NOT EXISTS idx_sqls_app_id ON sqls(app_id);
CREATE INDEX IF NOT EXISTS idx_sqls_connection_id ON sqls(connection_id);
CREATE INDEX IF NOT EXISTS idx_invoke_logs_created_at ON invoke_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_invoke_logs_app_created ON invoke_logs(app_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invoke_logs_sql_created ON invoke_logs(sql_id, created_at);
CREATE INDEX IF NOT EXISTS idx_meta_tables_app_id ON meta_tables(app_id);
CREATE INDEX IF NOT EXISTS idx_meta_fields_table_id ON meta_fields(table_id);
CREATE INDEX IF NOT EXISTS idx_meta_shards_table_id ON meta_shards(table_id);
CREATE INDEX IF NOT EXISTS idx_meta_record_index_table_created ON meta_record_index(table_id, created_at);
CREATE INDEX IF NOT EXISTS idx_meta_record_index_app_created ON meta_record_index(app_id, created_at);
CREATE INDEX IF NOT EXISTS idx_meta_record_index_created ON meta_record_index(created_at);
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

export interface InvokeLogRecord {
  id: number;
  app_id: string;
  sql_id: string;
  connection_id: string | null;
  method: string;
  status_code: number;
  success: number;
  error_message: string | null;
  latency_ms: number;
  row_count: number | null;
  params: string | null;
  created_at: string;
}

export interface InsertInvokeLogInput {
  app_id: string;
  sql_id: string;
  connection_id?: string | null;
  method: string;
  status_code: number;
  success: boolean;
  error_message?: string | null;
  latency_ms: number;
  row_count?: number | null;
  params?: string | null;
}

export interface ListInvokeLogsOptions {
  page?: number;
  size?: number;
  sql_id?: string;
  success?: boolean;
  start?: string;
  end?: string;
  latency_min?: number;
  latency_max?: number;
}

/** Invoke log row joined with the SQL's current name (null if the SQL was deleted). */
export interface InvokeLogListRecord extends InvokeLogRecord {
  sql_name: string | null;
}

/** Detail row: list fields plus the SQL text snapshot (null if the SQL was deleted). */
export interface InvokeLogDetailRecord extends InvokeLogListRecord {
  sql_text: string | null;
}

export interface EntityCounts {
  apps: number;
  connections: number;
  models: number;
  sqls: number;
}

export interface InvokeDailyStat {
  date: string;
  total: number;
  success: number;
  failed: number;
}

export interface InvokeStatsResult {
  total: number;
  success: number;
  failed: number;
  avg_latency_ms: number;
  daily: InvokeDailyStat[];
}

export interface GetInvokeStatsOptions {
  days?: number;
  sql_id?: string;
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

let dbInstance: SqliteDatabase | null = null;
let dbPathResolved: string | null = null;

function nowISO(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

/** Default DB path anchored to package root (apps/services/data/sql2api.db).
 * Works for both src/services and dist/services (same depth). */
const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/sql2api.db');

function resolveDbPath(): string {
  const raw = process.env.SQLITE_PATH;
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  }
  // Prefer package-anchored default so CLI (repo root) and service share one file.
  // config.envs.sqlite.path is only used when it differs from the relative default.
  const configured = config.envs.sqlite.path;
  if (configured && configured !== './data/sql2api.db') {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }
  return DEFAULT_DB_PATH;
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
export function getDB(): SqliteDatabase {
  const resolved = resolveDbPath();
  if (dbInstance && dbPathResolved === resolved) {
    return dbInstance;
  }
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = openDatabase(resolved);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SQLITE_DDL);
  migrateInvokeLogsParams(db);
  migrateSqlsTypeCheck(db);
  migrateSqlsStatusCheck(db);
  migrateConnectionsTypeCheck(db);

  dbInstance = db;
  dbPathResolved = resolved;
  return db;
}

/** Add `params` column to existing invoke_logs tables created before this field existed. */
function migrateInvokeLogsParams(db: SqliteDatabase): void {
  const columns = db.prepare('PRAGMA table_info(invoke_logs)').all() as Array<{
    name: string;
  }>;
  if (!columns.some((col) => col.name === 'params')) {
    db.exec('ALTER TABLE invoke_logs ADD COLUMN params TEXT');
  }
}

/**
 * Rebuild `sqls` when the CHECK constraint predates the `complex` sql_type.
 * SQLite cannot ALTER CHECK constraints in place.
 */
function migrateSqlsTypeCheck(db: SqliteDatabase): void {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sqls'"
    )
    .get() as { sql?: string } | undefined;
  if (!row?.sql) {
    return;
  }
  if (row.sql.includes("'complex'") && !row.sql.includes("'delete'")) {
    return;
  }

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    db.exec(`
CREATE TABLE sqls_new (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  sql_text TEXT NOT NULL,
  sql_type TEXT NOT NULL CHECK(sql_type IN ('select', 'insert', 'update', 'complex')),
  method TEXT NOT NULL CHECK(method IN ('GET', 'POST', 'PATCH')),
  params_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled', 'disabled', 'draft')),
  review_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE,
  UNIQUE(app_id, name)
);
INSERT INTO sqls_new (
  id, app_id, connection_id, name, description, sql_text,
  sql_type, method, params_json, status, review_json, created_at, updated_at
)
SELECT
  id, app_id, connection_id, name, description, sql_text,
  CASE WHEN sql_type = 'delete' THEN 'complex' ELSE sql_type END,
  CASE WHEN method = 'DELETE' THEN 'POST' ELSE method END,
  params_json, status, review_json, created_at, updated_at
FROM sqls;
DROP TABLE sqls;
ALTER TABLE sqls_new RENAME TO sqls;
CREATE INDEX IF NOT EXISTS idx_sqls_app_id ON sqls(app_id);
CREATE INDEX IF NOT EXISTS idx_sqls_connection_id ON sqls(connection_id);
`);
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/**
 * Rebuild `sqls` when the status CHECK constraint predates the `draft` value.
 * SQLite cannot ALTER CHECK constraints in place.
 */
function migrateSqlsStatusCheck(db: SqliteDatabase): void {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sqls'"
    )
    .get() as { sql?: string } | undefined;
  if (!row?.sql) {
    return;
  }
  if (row.sql.includes("'draft'")) {
    return;
  }

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    db.exec(`
CREATE TABLE sqls_new (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  sql_text TEXT NOT NULL,
  sql_type TEXT NOT NULL CHECK(sql_type IN ('select', 'insert', 'update', 'complex')),
  method TEXT NOT NULL CHECK(method IN ('GET', 'POST', 'PATCH')),
  params_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled', 'disabled', 'draft')),
  review_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE,
  UNIQUE(app_id, name)
);
INSERT INTO sqls_new (
  id, app_id, connection_id, name, description, sql_text,
  sql_type, method, params_json, status, review_json, created_at, updated_at
)
SELECT
  id, app_id, connection_id, name, description, sql_text,
  sql_type, method, params_json, status, review_json, created_at, updated_at
FROM sqls;
DROP TABLE sqls;
ALTER TABLE sqls_new RENAME TO sqls;
CREATE INDEX IF NOT EXISTS idx_sqls_app_id ON sqls(app_id);
CREATE INDEX IF NOT EXISTS idx_sqls_connection_id ON sqls(connection_id);
`);
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/**
 * Rebuild `connections` when the type CHECK constraint predates protocol-compatible
 * datasource types (mariadb, tidb, …). SQLite cannot ALTER CHECK constraints in place.
 */
function migrateConnectionsTypeCheck(db: SqliteDatabase): void {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'connections'"
    )
    .get() as { sql?: string } | undefined;
  if (!row?.sql) {
    return;
  }
  const missing = DATASOURCE_TYPES.some((t) => !row.sql!.includes(`'${t}'`));
  if (!missing) {
    return;
  }

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    db.exec(`
CREATE TABLE connections_new (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN (${CONNECTIONS_TYPE_CHECK})),
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
INSERT INTO connections_new (
  id, app_id, name, type, host, port, username, password_enc, database,
  status, created_at, updated_at
)
SELECT
  id, app_id, name, type, host, port, username, password_enc, database,
  status, created_at, updated_at
FROM connections;
DROP TABLE connections;
ALTER TABLE connections_new RENAME TO connections;
CREATE INDEX IF NOT EXISTS idx_connections_app_id ON connections(app_id);
`);
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
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

export function listApps(options: ListOptions = {}): PaginatedResult<AppRecord> {
  const page = options.page && options.page > 0 ? options.page : 1;
  const size = options.size && options.size > 0 ? Math.min(options.size, 100) : 20;
  const offset = (page - 1) * size;

  const params: unknown[] = [];
  let where = '1=1';
  if (options.keyword) {
    where += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${options.keyword}%`, `%${options.keyword}%`);
  }

  const db = getDB();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM apps WHERE ${where}`).get(...params) as { c: number }).c;
  const list = db
    .prepare(`SELECT * FROM apps WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, size, offset) as AppRecord[];

  return { list, total, page, size };
}

export function getApp(id: string): AppRecord | null {
  return (getDB().prepare('SELECT * FROM apps WHERE id = ?').get(id) as AppRecord | undefined) || null;
}

export function getAppByName(name: string): AppRecord | null {
  return (getDB().prepare('SELECT * FROM apps WHERE name = ?').get(name) as AppRecord | undefined) || null;
}

export interface UpdateAppInput {
  name?: string;
  description?: string;
  status?: EntityStatus;
}

export function updateApp(id: string, input: UpdateAppInput): AppRecord | null {
  const existing = getApp(id);
  if (!existing) {
    return null;
  }
  const updated: AppRecord = {
    ...existing,
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    status: input.status ?? existing.status,
    updated_at: nowISO()
  };
  getDB().prepare(
    `UPDATE apps SET name = @name, description = @description, status = @status, updated_at = @updated_at
     WHERE id = @id`
  ).run(updated);
  return updated;
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

export function getApiKey(app_id: string, id: string): ApiKeyRecord | null {
  return (
    (getDB()
      .prepare('SELECT * FROM api_keys WHERE id = ? AND app_id = ?')
      .get(id, app_id) as ApiKeyRecord | undefined) || null
  );
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
  app_id: string | null,
  options: ListOptions = {}
): PaginatedResult<ConnectionRecord> {
  const page = options.page && options.page > 0 ? options.page : 1;
  const size = options.size && options.size > 0 ? Math.min(options.size, 100) : 20;
  const offset = (page - 1) * size;

  const params: unknown[] = [];
  let where = '1=1';
  if (app_id) {
    where += ' AND app_id = ?';
    params.push(app_id);
  }
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

export function getConnection(app_id: string | null, id: string): ConnectionRecord | null {
  if (app_id) {
    return (
      (getDB()
        .prepare('SELECT * FROM connections WHERE id = ? AND app_id = ?')
        .get(id, app_id) as ConnectionRecord | undefined) || null
    );
  }
  return (
    (getDB()
      .prepare('SELECT * FROM connections WHERE id = ?')
      .get(id) as ConnectionRecord | undefined) || null
  );
}

/** Decrypt password and return a DatasourceConfig for the datasource layer. */
export function getConnectionConfig(app_id: string | null, id: string): DatasourceConfig | null {
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
  app_id: string | null,
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

  if (app_id) {
    getDB().prepare(
      `UPDATE connections SET
         name = @name, type = @type, host = @host, port = @port,
         username = @username, password_enc = @password_enc, database = @database,
         status = @status, updated_at = @updated_at
       WHERE id = @id AND app_id = @app_id`
    ).run(updated);
  } else {
    getDB().prepare(
      `UPDATE connections SET
         name = @name, type = @type, host = @host, port = @port,
         username = @username, password_enc = @password_enc, database = @database,
         status = @status, updated_at = @updated_at
       WHERE id = @id`
    ).run(updated);
  }

  return updated;
}

export function deleteConnection(app_id: string | null, id: string): boolean {
  if (app_id) {
    const result = getDB()
      .prepare('DELETE FROM connections WHERE id = ? AND app_id = ?')
      .run(id, app_id);
    return result.changes > 0;
  }
  const result = getDB()
    .prepare('DELETE FROM connections WHERE id = ?')
    .run(id);
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
  app_id: string | null,
  options: ListOptions = {}
): PaginatedResult<ModelRecord> {
  const page = options.page && options.page > 0 ? options.page : 1;
  const size = options.size && options.size > 0 ? Math.min(options.size, 100) : 20;
  const offset = (page - 1) * size;

  const params: unknown[] = [];
  let where = '1=1';
  if (app_id) {
    where += ' AND app_id = ?';
    params.push(app_id);
  }
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

export function getModel(app_id: string | null, id: string): ModelRecord | null {
  if (app_id) {
    return (
      (getDB()
        .prepare('SELECT * FROM models WHERE id = ? AND app_id = ?')
        .get(id, app_id) as ModelRecord | undefined) || null
    );
  }
  return (
    (getDB()
      .prepare('SELECT * FROM models WHERE id = ?')
      .get(id) as ModelRecord | undefined) || null
  );
}

export function deleteModel(app_id: string | null, id: string): boolean {
  if (app_id) {
    const result = getDB()
      .prepare('DELETE FROM models WHERE id = ? AND app_id = ?')
      .run(id, app_id);
    return result.changes > 0;
  }
  const result = getDB()
    .prepare('DELETE FROM models WHERE id = ?')
    .run(id);
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
  app_id: string | null,
  options: ListOptions = {}
): PaginatedResult<SqlRecord> {
  const page = options.page && options.page > 0 ? options.page : 1;
  const size = options.size && options.size > 0 ? Math.min(options.size, 100) : 20;
  const offset = (page - 1) * size;

  const params: unknown[] = [];
  let where = '1=1';
  if (app_id) {
    where += ' AND app_id = ?';
    params.push(app_id);
  }
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

/** List all SQL records without pagination (for OpenAPI generation). */
export function listAllSqls(app_id: string | null): SqlRecord[] {
  const db = getDB();
  if (app_id) {
    return db
      .prepare('SELECT * FROM sqls WHERE app_id = ? ORDER BY created_at DESC')
      .all(app_id) as SqlRecord[];
  }
  return db
    .prepare('SELECT * FROM sqls ORDER BY created_at DESC')
    .all() as SqlRecord[];
}

export function getSql(app_id: string | null, id: string): SqlRecord | null {
  if (app_id) {
    return (
      (getDB()
        .prepare('SELECT * FROM sqls WHERE id = ? AND app_id = ?')
        .get(id, app_id) as SqlRecord | undefined) || null
    );
  }
  return (
    (getDB()
      .prepare('SELECT * FROM sqls WHERE id = ?')
      .get(id) as SqlRecord | undefined) || null
  );
}

export function updateSql(
  app_id: string | null,
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

  if (app_id) {
    getDB().prepare(
      `UPDATE sqls SET
         connection_id = @connection_id, name = @name, description = @description,
         sql_text = @sql_text, sql_type = @sql_type, method = @method,
         params_json = @params_json, review_json = @review_json,
         status = @status, updated_at = @updated_at
       WHERE id = @id AND app_id = @app_id`
    ).run(updated);
  } else {
    getDB().prepare(
      `UPDATE sqls SET
         connection_id = @connection_id, name = @name, description = @description,
         sql_text = @sql_text, sql_type = @sql_type, method = @method,
         params_json = @params_json, review_json = @review_json,
         status = @status, updated_at = @updated_at
       WHERE id = @id`
    ).run(updated);
  }

  return updated;
}

export function deleteSql(app_id: string | null, id: string): boolean {
  if (app_id) {
    const result = getDB()
      .prepare('DELETE FROM sqls WHERE id = ? AND app_id = ?')
      .run(id, app_id);
    return result.changes > 0;
  }
  const result = getDB()
    .prepare('DELETE FROM sqls WHERE id = ?')
    .run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Invoke logs
// ---------------------------------------------------------------------------

export function insertInvokeLog(input: InsertInvokeLogInput): InvokeLogRecord {
  const created_at = nowISO();
  const params = input.params ?? null;
  const result = getDB().prepare(
    `INSERT INTO invoke_logs
     (app_id, sql_id, connection_id, method, status_code, success,
      error_message, latency_ms, row_count, params, created_at)
     VALUES
     (@app_id, @sql_id, @connection_id, @method, @status_code, @success,
      @error_message, @latency_ms, @row_count, @params, @created_at)`
  ).run({
    app_id: input.app_id,
    sql_id: input.sql_id,
    connection_id: input.connection_id ?? null,
    method: input.method,
    status_code: input.status_code,
    success: input.success ? 1 : 0,
    error_message: input.error_message ?? null,
    latency_ms: input.latency_ms,
    row_count: input.row_count ?? null,
    params,
    created_at
  });

  return {
    id: Number(result.lastInsertRowid),
    app_id: input.app_id,
    sql_id: input.sql_id,
    connection_id: input.connection_id ?? null,
    method: input.method,
    status_code: input.status_code,
    success: input.success ? 1 : 0,
    error_message: input.error_message ?? null,
    latency_ms: input.latency_ms,
    row_count: input.row_count ?? null,
    params,
    created_at
  };
}

export function getInvokeLog(id: number): InvokeLogDetailRecord | null {
  const row = getDB()
    .prepare(
      `SELECT l.*, s.name AS sql_name, s.sql_text AS sql_text
       FROM invoke_logs l
       LEFT JOIN sqls s ON s.id = l.sql_id
       WHERE l.id = ?`
    )
    .get(id) as InvokeLogDetailRecord | undefined;
  return row ?? null;
}

export function listInvokeLogs(
  app_id: string | null,
  options: ListInvokeLogsOptions = {}
): PaginatedResult<InvokeLogListRecord> {
  const page = options.page && options.page > 0 ? options.page : 1;
  const size = options.size && options.size > 0 ? Math.min(options.size, 100) : 20;
  const offset = (page - 1) * size;

  const params: unknown[] = [];
  let where = '1=1';
  if (app_id) {
    where += ' AND l.app_id = ?';
    params.push(app_id);
  }
  if (options.sql_id) {
    where += ' AND l.sql_id = ?';
    params.push(options.sql_id);
  }
  if (options.success !== undefined) {
    where += ' AND l.success = ?';
    params.push(options.success ? 1 : 0);
  }
  if (options.start) {
    where += ' AND l.created_at >= ?';
    params.push(options.start);
  }
  if (options.end) {
    where += ' AND l.created_at <= ?';
    params.push(options.end);
  }
  if (options.latency_min !== undefined) {
    where += ' AND l.latency_ms >= ?';
    params.push(options.latency_min);
  }
  if (options.latency_max !== undefined) {
    where += ' AND l.latency_ms <= ?';
    params.push(options.latency_max);
  }

  const db = getDB();
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM invoke_logs l WHERE ${where}`).get(...params) as { c: number }).c;
  const list = db
    .prepare(
      `SELECT l.*, s.name AS sql_name
       FROM invoke_logs l
       LEFT JOIN sqls s ON s.id = l.sql_id
       WHERE ${where}
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, size, offset) as InvokeLogListRecord[];

  return { list, total, page, size };
}

/** Global entity counts for the admin dashboard overview. */
export function getEntityCounts(): EntityCounts {
  const db = getDB();
  const count = (table: string): number =>
    (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
  return {
    apps: count('apps'),
    connections: count('connections'),
    models: count('models'),
    sqls: count('sqls')
  };
}

export function getInvokeStats(
  app_id: string | null,
  options: GetInvokeStatsOptions = {}
): InvokeStatsResult {
  const days = options.days && options.days > 0 ? Math.min(options.days, 30) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const params: unknown[] = [since];
  let where = 'created_at >= ?';
  if (app_id) {
    where += ' AND app_id = ?';
    params.push(app_id);
  }
  if (options.sql_id) {
    where += ' AND sql_id = ?';
    params.push(options.sql_id);
  }

  const db = getDB();
  const summary = db.prepare(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(success), 0) AS success,
       COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
     FROM invoke_logs WHERE ${where}`
  ).get(...params) as { total: number; success: number; avg_latency_ms: number };

  const total = summary.total || 0;
  const success = summary.success || 0;
  const failed = total - success;
  const avg_latency_ms = total > 0 ? Math.round(summary.avg_latency_ms) : 0;

  const dailyRows = db.prepare(
    `SELECT
       date(created_at) AS date,
       COUNT(*) AS total,
       COALESCE(SUM(success), 0) AS success
     FROM invoke_logs
     WHERE ${where}
     GROUP BY date(created_at)
     ORDER BY date ASC`
  ).all(...params) as Array<{ date: string; total: number; success: number }>;

  const daily: InvokeDailyStat[] = dailyRows.map((row) => ({
    date: row.date,
    total: row.total,
    success: row.success,
    failed: row.total - row.success
  }));

  return { total, success, failed, avg_latency_ms, daily };
}

/** Delete invoke logs older than retentionDays. Returns number of deleted rows. */
export function purgeInvokeLogs(retentionDays: number): number {
  const days = retentionDays > 0 ? retentionDays : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result = getDB()
    .prepare('DELETE FROM invoke_logs WHERE created_at < ?')
    .run(cutoff);
  return result.changes;
}

// ─── settings (key/value JSON) ──────────────────────────────────────────────

export interface SettingRecord {
  key: string;
  value_json: string;
  updated_at: string;
}

/** Read a JSON setting; returns null when missing or JSON is invalid. */
export function getSettingJSON<T>(key: string): T | null {
  const row = getDB()
    .prepare('SELECT * FROM settings WHERE key = ?')
    .get(key) as SettingRecord | undefined;
  if (!row) {
    return null;
  }
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return null;
  }
}

/** Upsert a JSON setting. */
export function setSettingJSON(key: string, value: unknown): SettingRecord {
  const now = nowISO();
  const row: SettingRecord = {
    key,
    value_json: JSON.stringify(value ?? null),
    updated_at: now
  };
  getDB()
    .prepare(
      `INSERT INTO settings (key, value_json, updated_at)
       VALUES (@key, @value_json, @updated_at)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`
    )
    .run(row);
  return row;
}

/** Delete a setting by key. Returns true when a row was removed. */
export function deleteSetting(key: string): boolean {
  const result = getDB().prepare('DELETE FROM settings WHERE key = ?').run(key);
  return result.changes > 0;
}
