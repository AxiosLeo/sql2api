import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { HttpResponse } from '@axiosleo/koapp';
import type { KoaContext } from '@axiosleo/koapp';
import {
  closeDB,
  createApp,
  createConnection,
  createSql,
  deleteSql,
  removeApp
} from '../../services/sqlite';
import controller from './invoke.controller';

describe('InvokeController mock short-circuit', function () {
  this.timeout(10000);

  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sql2api-invoke-'));
    process.env.SQLITE_PATH = path.join(tmpDir, 'test.db');
    process.env.APP_SECRET = 'test-secret-for-unit-tests';
    closeDB();
  });

  after(() => {
    closeDB();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns stored mock_data without hitting the datasource', async () => {
    const app = createApp('invoke-mock-app');
    const conn = createConnection({
      app_id: app.id,
      name: 'unreachable-mysql',
      type: 'mysql',
      host: '127.0.0.1',
      port: 1,
      username: 'root',
      password: 'x',
      database: 'demo'
    });

    const mockPayload = {
      rows: [{ id: 42, name: 'Mock User' }],
      row_count: 1
    };
    const sql = createSql({
      app_id: app.id,
      connection_id: conn.id,
      name: 'mock-select',
      sql_text: 'SELECT id, name FROM users WHERE id = :id',
      sql_type: 'select',
      method: 'GET',
      params: [{ name: 'id', rule: 'required|integer' }],
      status: 'enabled',
      mock_enabled: true,
      mock_data_json: JSON.stringify(mockPayload)
    });

    const context = {
      params: { uuid: sql.id },
      method: 'GET',
      query: { id: '42' },
      body: {},
      auth: { app_id: app.id, is_admin: false }
    } as unknown as KoaContext;

    try {
      await controller.invoke(context);
      assert.fail('expected HttpResponse');
    } catch (err) {
      assert.ok(err instanceof HttpResponse);
      assert.strictEqual(err.status, 200);
      assert.deepStrictEqual(err.data, mockPayload);
    }

    assert.ok(deleteSql(app.id, sql.id));
    assert.ok(removeApp(app.id));
  });

  it('still validates params when mock is enabled', async () => {
    const app = createApp('invoke-mock-params-app');
    const conn = createConnection({
      app_id: app.id,
      name: 'unreachable-mysql-2',
      type: 'mysql',
      host: '127.0.0.1',
      port: 1,
      username: 'root',
      password: 'x',
      database: 'demo'
    });

    const sql = createSql({
      app_id: app.id,
      connection_id: conn.id,
      name: 'mock-select-params',
      sql_text: 'SELECT id FROM users WHERE id = :id',
      sql_type: 'select',
      method: 'GET',
      params: [{ name: 'id', rule: 'required|integer' }],
      status: 'enabled',
      mock_enabled: true,
      mock_data_json: JSON.stringify({ rows: [], row_count: 0 })
    });

    const context = {
      params: { uuid: sql.id },
      method: 'GET',
      query: {},
      body: {},
      auth: { app_id: app.id, is_admin: false }
    } as unknown as KoaContext;

    try {
      await controller.invoke(context);
      assert.fail('expected validation failure');
    } catch (err) {
      assert.ok(err instanceof HttpResponse);
      assert.strictEqual(err.status, 400);
    }

    assert.ok(deleteSql(app.id, sql.id));
    assert.ok(removeApp(app.id));
  });
});
