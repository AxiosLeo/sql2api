import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { closeDB, createApp, getDB } from './sqlite';
import {
  createMetaField,
  createMetaTable,
  deleteMetaField,
  deleteMetaTable,
  getMetaRecord,
  getMetaTable,
  insertMetaRecordForTest,
  listMetaFields,
  listMetaRecords,
  listMetaTables,
  listShards,
  parseMetaFieldConfig,
  updateMetaField,
  updateMetaTable
} from './meta';

describe('meta service', function () {
  this.timeout(10000);

  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sql2api-meta-'));
    process.env.SQLITE_PATH = path.join(tmpDir, 'test.db');
    process.env.APP_SECRET = 'test-secret-for-unit-tests';
    closeDB();
  });

  after(() => {
    closeDB();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.SQLITE_PATH;
  });

  it('creates a meta table with system fields and shard #1', () => {
    const app = createApp('meta-app-1');
    const table = createMetaTable({
      app_id: app.id,
      name: 'customers',
      description: 'Customer meta table'
    });

    assert.ok(table.id);
    assert.strictEqual(table.name, 'customers');

    const fields = listMetaFields(app.id, table.id);
    assert.strictEqual(fields.length, 4);
    assert.ok(fields.every((f) => f.is_system === 1));
    assert.deepStrictEqual(
      fields.map((f) => f.type).sort(),
      ['created_at', 'created_by', 'updated_at', 'updated_by'].sort()
    );

    const shards = listShards(table.id);
    assert.strictEqual(shards.length, 1);
    assert.strictEqual(shards[0].shard_no, 1);
    assert.strictEqual(shards[0].row_count, 0);

    const physical = shards[0].physical_table;
    const exists = getDB()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(physical) as { name: string } | undefined;
    assert.ok(exists);

    const detail = getMetaTable(app.id, table.id);
    assert.ok(detail);
    assert.strictEqual(detail!.field_count, 4);
    assert.strictEqual(detail!.record_count, 0);
  });

  it('creates user fields and cleans cells on field delete', () => {
    const app = createApp('meta-app-2');
    const table = createMetaTable({ app_id: app.id, name: 'orders' });
    const title = createMetaField(app.id, table.id, {
      name: 'title',
      type: 'text',
      validator: 'required|size:100'
    });
    assert.strictEqual(title.type, 'text');
    assert.strictEqual(title.validator, 'required|size:100');

    const attachment = createMetaField(app.id, table.id, {
      name: 'files',
      type: 'attachment'
    });
    const cfg = parseMetaFieldConfig(attachment.config_json);
    assert.strictEqual(cfg.multiple, true);

    insertMetaRecordForTest({
      app_id: app.id,
      table_id: table.id,
      created_by: 'u1',
      cells: [
        { field_id: title.id, value: 'hello' },
        {
          field_id: attachment.id,
          value: [{ file_link: 'https://example.com/a.pdf' }]
        }
      ]
    });

    const listed = listMetaRecords(app.id, { table_id: table.id });
    assert.strictEqual(listed.total, 1);
    assert.strictEqual(listed.list.length, 1);

    const detail = getMetaRecord(app.id, listed.list[0].record_id);
    assert.ok(detail);
    assert.strictEqual(detail!.data.title, 'hello');
    assert.deepStrictEqual(detail!.data.files, [
      { file_link: 'https://example.com/a.pdf' }
    ]);
    assert.strictEqual(detail!.data.created_by, 'u1');

    deleteMetaField(app.id, title.id);
    const after = getMetaRecord(app.id, listed.list[0].record_id);
    assert.ok(after);
    assert.strictEqual(after!.data.title, undefined);
    assert.ok(after!.data.files);

    const shard = listShards(table.id)[0];
    const remaining = getDB()
      .prepare(
        `SELECT COUNT(*) AS c FROM "${shard.physical_table}" WHERE field_id = ?`
      )
      .get(title.id) as { c: number };
    assert.strictEqual(remaining.c, 0);
  });

  it('creates reverse field for two_way_link and cascades delete', () => {
    const app = createApp('meta-app-3');
    const left = createMetaTable({ app_id: app.id, name: 'left_tbl' });
    const right = createMetaTable({ app_id: app.id, name: 'right_tbl' });

    const link = createMetaField(app.id, left.id, {
      name: 'related',
      type: 'two_way_link',
      config: { target_table_id: right.id, multiple: false }
    });
    const linkCfg = parseMetaFieldConfig(link.config_json);
    assert.strictEqual(linkCfg.multiple, false);
    assert.ok(linkCfg.reverse_field_id);

    const reverse = listMetaFields(app.id, right.id).find(
      (f) => f.id === linkCfg.reverse_field_id
    );
    assert.ok(reverse);
    assert.strictEqual(reverse!.type, 'two_way_link');
    const reverseCfg = parseMetaFieldConfig(reverse!.config_json);
    assert.strictEqual(reverseCfg.target_table_id, left.id);
    assert.strictEqual(reverseCfg.reverse_field_id, link.id);
    assert.strictEqual(reverseCfg.multiple, true);
    assert.strictEqual(reverseCfg.link_scope, 'all');

    deleteMetaField(app.id, link.id);
    assert.strictEqual(
      listMetaFields(app.id, right.id).some((f) => f.id === reverse!.id),
      false
    );
  });

  it('stores and validates link association filters', () => {
    const app = createApp('meta-app-link-filter');
    const left = createMetaTable({ app_id: app.id, name: 'src' });
    const right = createMetaTable({ app_id: app.id, name: 'dst' });
    const statusField = createMetaField(app.id, right.id, {
      name: 'status',
      type: 'single_select',
      config: { options: ['open', 'closed'] }
    });

    const filtered = createMetaField(app.id, left.id, {
      name: 'open_items',
      type: 'one_way_link',
      config: {
        target_table_id: right.id,
        link_scope: 'filter',
        filters: [
          { field_id: statusField.id, op: 'eq', value: 'open' },
          { field_id: statusField.id, op: 'in', value: ['open', 'closed'] }
        ]
      }
    });
    const cfg = parseMetaFieldConfig(filtered.config_json);
    assert.strictEqual(cfg.link_scope, 'filter');
    assert.strictEqual(cfg.filters?.length, 2);

    const allScope = createMetaField(app.id, left.id, {
      name: 'all_items',
      type: 'one_way_link',
      config: {
        target_table_id: right.id,
        link_scope: 'all',
        filters: [{ field_id: statusField.id, op: 'eq', value: 'x' }]
      }
    });
    const allCfg = parseMetaFieldConfig(allScope.config_json);
    assert.strictEqual(allCfg.link_scope, 'all');
    assert.strictEqual(allCfg.filters, undefined);

    assert.throws(
      () =>
        createMetaField(app.id, left.id, {
          name: 'bad_empty',
          type: 'one_way_link',
          config: {
            target_table_id: right.id,
            link_scope: 'filter',
            filters: []
          }
        }),
      /At least one filter/
    );

    assert.throws(
      () =>
        createMetaField(app.id, left.id, {
          name: 'bad_field',
          type: 'one_way_link',
          config: {
            target_table_id: right.id,
            link_scope: 'filter',
            filters: [{ field_id: 'not-a-real-field', op: 'eq', value: 'x' }]
          }
        }),
      /does not belong/
    );
  });

  it('rejects link target from another app', () => {
    const appA = createApp('meta-app-4a');
    const appB = createApp('meta-app-4b');
    const tableA = createMetaTable({ app_id: appA.id, name: 'a' });
    const tableB = createMetaTable({ app_id: appB.id, name: 'b' });

    assert.throws(
      () =>
        createMetaField(appA.id, tableA.id, {
          name: 'bad_link',
          type: 'one_way_link',
          config: { target_table_id: tableB.id }
        }),
      /same app/
    );
  });

  it('updates and deletes meta tables (drops physical shards)', () => {
    const app = createApp('meta-app-5');
    const table = createMetaTable({ app_id: app.id, name: 'temp' });
    const shards = listShards(table.id);
    const physical = shards[0].physical_table;

    updateMetaTable(app.id, table.id, {
      name: 'temp2',
      description: 'updated',
      status: 'disabled'
    });
    const updated = getMetaTable(app.id, table.id);
    assert.strictEqual(updated!.name, 'temp2');
    assert.strictEqual(updated!.status, 'disabled');

    const ok = deleteMetaTable(app.id, table.id);
    assert.strictEqual(ok, true);
    assert.strictEqual(getMetaTable(app.id, table.id), null);

    const exists = getDB()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(physical) as { name: string } | undefined;
    assert.strictEqual(exists, undefined);
  });

  it('lists tables with pagination and protects system fields', () => {
    const app = createApp('meta-app-6');
    createMetaTable({ app_id: app.id, name: 't1' });
    createMetaTable({ app_id: app.id, name: 't2' });
    const page = listMetaTables(app.id, { page: 1, size: 1 });
    assert.strictEqual(page.size, 1);
    assert.strictEqual(page.total, 2);
    assert.strictEqual(page.list.length, 1);

    const fields = listMetaFields(app.id, page.list[0].id);
    const system = fields.find((f) => f.is_system === 1)!;
    assert.throws(
      () => updateMetaField(app.id, system.id, { name: 'nope' }),
      /System fields/
    );
    assert.throws(() => deleteMetaField(app.id, system.id), /System fields/);
  });

  it('aggregates sparse cells for record detail', () => {
    const app = createApp('meta-app-7');
    const table = createMetaTable({ app_id: app.id, name: 'sparse' });
    const a = createMetaField(app.id, table.id, { name: 'a', type: 'number' });
    createMetaField(app.id, table.id, { name: 'b', type: 'text' });

    const rec = insertMetaRecordForTest({
      app_id: app.id,
      table_id: table.id,
      cells: [{ field_id: a.id, value: 42 }]
    });

    const detail = getMetaRecord(null, rec.record_id);
    assert.ok(detail);
    assert.strictEqual(detail!.data.a, 42);
    assert.strictEqual(detail!.data.b, undefined);
    assert.ok(detail!.fields.some((f) => f.name === 'b'));
  });
});
