import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  closeDB,
  createApp,
  createApiKey,
  createConnection,
  createSql,
  decryptPassword,
  deleteConnection,
  deleteModel,
  deleteSetting,
  deleteSql,
  getConnection,
  getConnectionConfig,
  getDB,
  getInvokeLog,
  getInvokeStats,
  getSettingJSON,
  getSql,
  insertInvokeLog,
  listApps,
  listConnections,
  listInvokeLogs,
  listSqls,
  purgeInvokeLogs,
  removeApp,
  resolveApiKey,
  revokeApiKey,
  setSettingJSON,
  updateConnection,
  updateSql,
  upsertModel
} from './sqlite';

describe('sqlite service', function () {
  this.timeout(10000);

  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sql2api-sqlite-'));
    process.env.SQLITE_PATH = path.join(tmpDir, 'test.db');
    process.env.APP_SECRET = 'test-secret-for-unit-tests';
    closeDB();
  });

  after(() => {
    closeDB();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.SQLITE_PATH;
  });

  it('creates apps and lists them', () => {
    const app = createApp('demo-app', 'Demo application');
    assert.ok(app.id);
    assert.strictEqual(app.name, 'demo-app');
    assert.strictEqual(app.status, 'active');

    const apps = listApps();
    assert.ok(apps.list.some((a) => a.id === app.id));
  });

  it('creates api key and resolves it', async () => {
    const app = createApp('key-app');
    const { record, token } = createApiKey(app.id, 'test-key');
    assert.ok(token.startsWith('sk2a_'));
    assert.strictEqual(record.prefix, token.slice(0, 12));

    const resolved = await resolveApiKey(token);
    assert.ok(resolved);
    assert.strictEqual(resolved!.app_id, app.id);
    assert.strictEqual(resolved!.key_id, record.id);

    assert.strictEqual(await resolveApiKey('sk2a_invalid'), null);

    revokeApiKey(record.id);
    assert.strictEqual(await resolveApiKey(token), null);
  });

  it('stores connections with encrypted passwords', () => {
    const app = createApp('conn-app');
    const conn = createConnection({
      app_id: app.id,
      name: 'local-mysql',
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      username: 'root',
      password: 's3cret-pass',
      database: 'demo'
    });

    assert.notStrictEqual(conn.password_enc, 's3cret-pass');
    assert.strictEqual(decryptPassword(conn.password_enc), 's3cret-pass');

    const cfg = getConnectionConfig(app.id, conn.id);
    assert.ok(cfg);
    assert.strictEqual(cfg!.password, 's3cret-pass');
    assert.strictEqual(cfg!.type, 'mysql');

    const listed = listConnections(app.id, { page: 1, size: 10 });
    assert.strictEqual(listed.total, 1);

    const updated = updateConnection(app.id, conn.id, { host: '10.0.0.1' });
    assert.ok(updated);
    assert.strictEqual(updated!.host, '10.0.0.1');

    assert.ok(deleteConnection(app.id, conn.id));
    assert.strictEqual(getConnection(app.id, conn.id), null);
  });

  it('can create a connection using password from another connection', () => {
    const app = createApp('copy-pw-app');
    const source = createConnection({
      app_id: app.id,
      name: 'source-mysql',
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      username: 'root',
      password: 'reuse-me',
      database: 'demo'
    });

    const stored = getConnectionConfig(app.id, source.id);
    assert.ok(stored);

    const copy = createConnection({
      app_id: app.id,
      name: 'source-mysql-copy',
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      username: 'root',
      password: stored!.password,
      database: 'demo2'
    });

    const copyCfg = getConnectionConfig(app.id, copy.id);
    assert.ok(copyCfg);
    assert.strictEqual(copyCfg!.password, 'reuse-me');
    assert.notStrictEqual(copy.password_enc, source.password_enc);
  });

  it('upserts models and manages sqls', () => {
    const app = createApp('sql-app');
    const conn = createConnection({
      app_id: app.id,
      name: 'pg',
      type: 'postgresql',
      host: '127.0.0.1',
      port: 5432,
      username: 'postgres',
      password: 'pg',
      database: 'app'
    });

    const model = upsertModel({
      app_id: app.id,
      connection_id: conn.id,
      table_name: 'users',
      comment: 'Users table',
      columns: [{
        name: 'id',
        type: 'bigint',
        nullable: false,
        default: null,
        comment: 'pk',
        is_primary: true,
        is_auto_increment: true
      }]
    });
    assert.ok(model.id);

    const again = upsertModel({
      app_id: app.id,
      connection_id: conn.id,
      table_name: 'users',
      comment: 'Updated',
      columns: [{
        name: 'id',
        type: 'bigint',
        nullable: false,
        default: null,
        comment: 'pk',
        is_primary: true,
        is_auto_increment: true
      }, {
        name: 'email',
        type: 'varchar',
        nullable: false,
        default: null,
        comment: '',
        is_primary: false,
        is_auto_increment: false
      }]
    });
    assert.strictEqual(again.id, model.id);
    assert.strictEqual(again.comment, 'Updated');
    assert.strictEqual(JSON.parse(again.columns_json).length, 2);

    const sql = createSql({
      app_id: app.id,
      connection_id: conn.id,
      name: 'get-user',
      sql_text: 'SELECT * FROM users WHERE id = :id',
      sql_type: 'select',
      method: 'GET',
      params: [{ name: 'id', rule: 'required|integer' }],
      review: { passed: true, issues: [] }
    });
    assert.ok(sql.id);

    const found = getSql(app.id, sql.id);
    assert.ok(found);
    assert.strictEqual(found!.name, 'get-user');

    const updated = updateSql(app.id, sql.id, { status: 'disabled' });
    assert.strictEqual(updated!.status, 'disabled');

    const listed = listSqls(app.id, { sql_type: 'select' });
    assert.strictEqual(listed.total, 1);

    assert.ok(deleteSql(app.id, sql.id));
    assert.ok(deleteModel(app.id, model.id));
    assert.ok(removeApp(app.id));
  });

  it('supports draft status on sqls', () => {
    const app = createApp('draft-app');
    const conn = createConnection({
      app_id: app.id,
      name: 'draft-mysql',
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      username: 'root',
      password: 'x',
      database: 'demo'
    });

    const draft = createSql({
      app_id: app.id,
      connection_id: conn.id,
      name: 'draft-query',
      sql_text: 'SELECT 1',
      sql_type: 'select',
      method: 'GET',
      status: 'draft',
      review: {
        passed: false,
        issues: [{ severity: 'info', message: 'Saved as draft — not reviewed' }]
      }
    });
    assert.strictEqual(draft.status, 'draft');

    const promoted = updateSql(app.id, draft.id, { status: 'enabled' });
    assert.strictEqual(promoted!.status, 'enabled');

    assert.ok(deleteSql(app.id, draft.id));
    assert.ok(removeApp(app.id));
  });

  it('migrates connections type CHECK to include protocol-compatible types', () => {
    closeDB();
    const legacyPath = path.join(tmpDir, 'legacy-conn-type.db');
    process.env.SQLITE_PATH = legacyPath;

    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    const raw = new Database(legacyPath);
    raw.exec(`
CREATE TABLE apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('mysql', 'postgresql')),
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  database TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(app_id, name)
);
CREATE INDEX idx_connections_app_id ON connections(app_id);
INSERT INTO apps VALUES ('a1','legacy-conn','', 'active','t','t');
INSERT INTO connections VALUES (
  'c1','a1','legacy-mysql','mysql','127.0.0.1',3306,'u','enc','db','active','t','t'
);
`);
    raw.close();

    const db = getDB();
    const ddl = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'connections'"
      )
      .get() as { sql: string };
    assert.ok(ddl.sql.includes("'tidb'"), 'CHECK should include tidb');
    assert.ok(ddl.sql.includes("'opengauss'"), 'CHECK should include opengauss');
    assert.ok(ddl.sql.includes("'mariadb'"), 'CHECK should include mariadb');
    assert.ok(ddl.sql.includes("'oracle'"), 'CHECK should include oracle');
    assert.ok(ddl.sql.includes("'sqlserver'"), 'CHECK should include sqlserver');

    const conn = createConnection({
      app_id: 'a1',
      name: 'after-migrate-tidb',
      type: 'tidb',
      host: '127.0.0.1',
      port: 4000,
      username: 'root',
      password: 'pass',
      database: 'demo'
    });
    assert.strictEqual(conn.type, 'tidb');

    const oracle = createConnection({
      app_id: 'a1',
      name: 'after-migrate-oracle',
      type: 'oracle',
      host: '127.0.0.1',
      port: 1521,
      username: 'system',
      password: 'pass',
      database: 'ORCLPDB1'
    });
    assert.strictEqual(oracle.type, 'oracle');

    const mssql = createConnection({
      app_id: 'a1',
      name: 'after-migrate-sqlserver',
      type: 'sqlserver',
      host: '127.0.0.1',
      port: 1433,
      username: 'sa',
      password: 'pass',
      database: 'demo'
    });
    assert.strictEqual(mssql.type, 'sqlserver');
    assert.strictEqual(getConnection('a1', 'c1')?.type, 'mysql');

    closeDB();
    process.env.SQLITE_PATH = path.join(tmpDir, 'test.db');
    getDB();
  });

  it('migrates sqls status CHECK to include draft', () => {
    closeDB();
    const legacyPath = path.join(tmpDir, 'legacy-status.db');
    process.env.SQLITE_PATH = legacyPath;

    // Bootstrap a minimal DB whose sqls CHECK lacks draft, then reopen via getDB.
    const Database = require('better-sqlite3') as typeof import('better-sqlite3');
    const raw = new Database(legacyPath);
    raw.exec(`
CREATE TABLE apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  database TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE sqls (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  sql_text TEXT NOT NULL,
  sql_type TEXT NOT NULL CHECK(sql_type IN ('select', 'insert', 'update', 'complex')),
  method TEXT NOT NULL CHECK(method IN ('GET', 'POST', 'PATCH')),
  params_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled', 'disabled')),
  review_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO apps VALUES ('a1','legacy','', 'active','t','t');
INSERT INTO connections VALUES (
  'c1','a1','c','mysql','127.0.0.1',3306,'u','enc','db','active','t','t'
);
INSERT INTO sqls VALUES (
  's1','a1','c1','legacy-sql','','SELECT 1','select','GET','[]','enabled','{}','t','t'
);
`);
    raw.close();

    const db = getDB();
    const ddl = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sqls'"
      )
      .get() as { sql: string };
    assert.ok(ddl.sql.includes("'draft'"), 'CHECK should include draft');

    const draft = createSql({
      app_id: 'a1',
      connection_id: 'c1',
      name: 'after-migrate-draft',
      sql_text: 'SELECT 2',
      sql_type: 'select',
      method: 'GET',
      status: 'draft'
    });
    assert.strictEqual(draft.status, 'draft');

    closeDB();
    process.env.SQLITE_PATH = path.join(tmpDir, 'test.db');
    getDB();
  });

  it('records invoke logs, aggregates stats, and purges expired rows', () => {
    const app = createApp('stats-app');
    const conn = createConnection({
      app_id: app.id,
      name: 'stats-mysql',
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      username: 'root',
      password: 'pass',
      database: 'stats'
    });
    const sql = createSql({
      app_id: app.id,
      connection_id: conn.id,
      name: 'list-users',
      sql_text: 'SELECT * FROM users',
      sql_type: 'select',
      method: 'GET',
      params: [],
      review: { passed: true, issues: [] }
    });

    insertInvokeLog({
      app_id: app.id,
      sql_id: sql.id,
      connection_id: conn.id,
      method: 'GET',
      status_code: 200,
      success: true,
      latency_ms: 40,
      row_count: 3,
      params: JSON.stringify({ limit: 10 })
    });
    insertInvokeLog({
      app_id: app.id,
      sql_id: sql.id,
      connection_id: conn.id,
      method: 'GET',
      status_code: 405,
      success: false,
      error_message: 'Method Not Allowed',
      latency_ms: 5,
      row_count: null
    });

    const listed = listInvokeLogs(app.id, { page: 1, size: 10 });
    assert.strictEqual(listed.total, 2);
    assert.strictEqual(listed.list[0].sql_id, sql.id);

    const detail = getInvokeLog(listed.list[1].id);
    assert.ok(detail);
    assert.strictEqual(detail!.sql_text, 'SELECT * FROM users');
    assert.strictEqual(detail!.sql_name, 'list-users');
    assert.strictEqual(detail!.params, JSON.stringify({ limit: 10 }));

    const failedOnly = listInvokeLogs(app.id, { success: false });
    assert.strictEqual(failedOnly.total, 1);
    assert.strictEqual(failedOnly.list[0].status_code, 405);

    const stats = getInvokeStats(app.id, { days: 30, sql_id: sql.id });
    assert.strictEqual(stats.total, 2);
    assert.strictEqual(stats.success, 1);
    assert.strictEqual(stats.failed, 1);
    assert.ok(stats.avg_latency_ms >= 0);
    assert.ok(stats.daily.length >= 1);

    const oldCreatedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    getDB().prepare(
      `INSERT INTO invoke_logs
       (app_id, sql_id, connection_id, method, status_code, success,
        error_message, latency_ms, row_count, created_at)
       VALUES (?, ?, ?, 'GET', 200, 1, NULL, 10, 1, ?)`
    ).run(app.id, sql.id, conn.id, oldCreatedAt);

    assert.strictEqual(listInvokeLogs(app.id).total, 3);
    const deleted = purgeInvokeLogs(30);
    assert.ok(deleted >= 1);
    assert.strictEqual(listInvokeLogs(app.id).total, 2);

    // Stats window still excludes purged rows
    const afterPurge = getInvokeStats(app.id, { days: 30 });
    assert.strictEqual(afterPurge.total, 2);
  });

  it('stores and deletes JSON settings', () => {
    assert.strictEqual(getSettingJSON('ai'), null);

    setSettingJSON('ai', {
      provider: 'ollama',
      ollama: { base_url: 'http://127.0.0.1:11434', model: 'gpt-oss:20b' }
    });
    const loaded = getSettingJSON<{
      provider: string;
      ollama: { base_url: string; model: string };
    }>('ai');
    assert.ok(loaded);
    assert.strictEqual(loaded!.provider, 'ollama');
    assert.strictEqual(loaded!.ollama.model, 'gpt-oss:20b');

    setSettingJSON('ai', { provider: 'local' });
    const updated = getSettingJSON<{ provider: string }>('ai');
    assert.strictEqual(updated!.provider, 'local');

    assert.strictEqual(deleteSetting('ai'), true);
    assert.strictEqual(getSettingJSON('ai'), null);
    assert.strictEqual(deleteSetting('ai'), false);
  });
});
