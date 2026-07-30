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
  deleteSql,
  getConnection,
  getConnectionConfig,
  getSql,
  listApps,
  listConnections,
  listSqls,
  removeApp,
  resolveApiKey,
  revokeApiKey,
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
});
