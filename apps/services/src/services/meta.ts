import crypto from 'crypto';
import type {
  MetaFieldConfig,
  MetaFieldType,
  MetaLinkFilter,
  MetaLinkFilterOp,
  MetaShardStatus,
  MetaTableStatus,
  MetaUserFieldType,
  PaginatedResult
} from '../types';
import {
  META_LINK_FILTER_OPS,
  META_SHARD_DEFAULT_CAPACITY,
  META_SYSTEM_FIELD_TYPES,
  META_USER_FIELD_TYPES
} from '../types';
import { getDB } from './sqlite';

function nowISO(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function withTransaction<T>(fn: () => T): T {
  const db = getDB();
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function physicalTableName(tableId: string, shardNo: number): string {
  return `mr_${tableId.replace(/-/g, '')}_p${shardNo}`;
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid physical table name: ${name}`);
  }
  return `"${name}"`;
}

function createCellShardTable(physicalTable: string): void {
  const db = getDB();
  const q = quoteIdent(physicalTable);
  db.exec(`
CREATE TABLE IF NOT EXISTS ${q} (
  record_id  TEXT NOT NULL,
  field_id   TEXT NOT NULL,
  value      TEXT CHECK (value IS NULL OR json_valid(value)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (record_id, field_id)
) WITHOUT ROWID;
`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS ${quoteIdent(`idx_${physicalTable}_field`)} ON ${q}(field_id)`
  );
}

function dropCellShardTable(physicalTable: string): void {
  const db = getDB();
  const q = quoteIdent(physicalTable);
  db.exec(`DROP TABLE IF EXISTS ${q}`);
}

function parseConfig(configJson: string): MetaFieldConfig {
  try {
    return JSON.parse(configJson || '{}') as MetaFieldConfig;
  } catch {
    return {};
  }
}

function serializeConfig(config: MetaFieldConfig | undefined): string {
  return JSON.stringify(config || {});
}

function parseCellValue(raw: string | null): unknown {
  if (raw == null) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export interface MetaTableRecord {
  id: string;
  app_id: string;
  name: string;
  description: string;
  status: MetaTableStatus;
  created_at: string;
  updated_at: string;
}

export interface MetaFieldRecord {
  id: string;
  table_id: string;
  name: string;
  type: MetaFieldType;
  validator: string;
  config_json: string;
  is_system: number;
  sort: number;
  created_at: string;
  updated_at: string;
}

export interface MetaShardRecord {
  id: string;
  table_id: string;
  shard_no: number;
  physical_table: string;
  row_count: number;
  capacity: number;
  status: MetaShardStatus;
  created_at: string;
}

export interface MetaRecordIndexRecord {
  record_id: string;
  app_id: string;
  table_id: string;
  shard_id: string;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
}

export interface MetaTableListItem extends MetaTableRecord {
  field_count: number;
  record_count: number;
}

export interface CreateMetaTableInput {
  app_id: string;
  name: string;
  description?: string;
}

export interface UpdateMetaTableInput {
  name?: string;
  description?: string;
  status?: MetaTableStatus;
}

export interface CreateMetaFieldInput {
  name: string;
  type: MetaUserFieldType;
  validator?: string;
  config?: MetaFieldConfig;
  sort?: number;
}

export interface UpdateMetaFieldInput {
  name?: string;
  type?: MetaUserFieldType;
  validator?: string;
  config?: MetaFieldConfig;
  sort?: number;
}

export interface ListMetaTablesOptions {
  page?: number;
  size?: number;
  keyword?: string;
}

export interface ListMetaRecordsOptions {
  page?: number;
  size?: number;
  table_id?: string;
}

const SYSTEM_FIELD_DEFS: Array<{
  name: string;
  type: (typeof META_SYSTEM_FIELD_TYPES)[number];
  sort: number;
}> = [
  { name: 'created_by', type: 'created_by', sort: 0 },
  { name: 'updated_by', type: 'updated_by', sort: 1 },
  { name: 'created_at', type: 'created_at', sort: 2 },
  { name: 'updated_at', type: 'updated_at', sort: 3 }
];

function assertUserFieldType(type: string): asserts type is MetaUserFieldType {
  if (!(META_USER_FIELD_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Invalid field type: ${type}`);
  }
}

function normalizeLinkAttachmentConfig(
  type: MetaFieldType,
  config: MetaFieldConfig
): MetaFieldConfig {
  const next: MetaFieldConfig = { ...config };
  if (type === 'one_way_link' || type === 'two_way_link' || type === 'attachment') {
    if (typeof next.multiple !== 'boolean') {
      next.multiple = true;
    }
  }
  if (type === 'one_way_link' || type === 'two_way_link') {
    if (next.link_scope !== 'filter') {
      next.link_scope = 'all';
      delete next.filters;
    } else {
      next.link_scope = 'filter';
      next.filters = Array.isArray(next.filters) ? next.filters : [];
    }
  } else {
    delete next.link_scope;
    delete next.filters;
  }
  if (type === 'parent_record') {
    delete next.multiple;
    delete next.target_table_id;
    delete next.reverse_field_id;
    delete next.link_scope;
    delete next.filters;
  }
  return next;
}

function assertLinkFilters(
  targetTableId: string,
  filters: MetaLinkFilter[] | undefined
): MetaLinkFilter[] {
  if (!filters || filters.length === 0) {
    throw Object.assign(
      new Error('At least one filter is required when link_scope is filter'),
      { status: 400 }
    );
  }

  const fieldIds = new Set(
    (
      getDB()
        .prepare('SELECT id FROM meta_fields WHERE table_id = ?')
        .all(targetTableId) as Array<{ id: string }>
    ).map((f) => f.id)
  );

  const normalized: MetaLinkFilter[] = [];
  for (const raw of filters) {
    if (!raw || typeof raw !== 'object') {
      throw Object.assign(new Error('Invalid filter entry'), { status: 400 });
    }
    const fieldId = typeof raw.field_id === 'string' ? raw.field_id.trim() : '';
    if (!fieldId || !fieldIds.has(fieldId)) {
      throw Object.assign(
        new Error(`Filter field_id does not belong to target table: ${fieldId || '(empty)'}`),
        { status: 400 }
      );
    }
    const op = raw.op as MetaLinkFilterOp;
    if (!(META_LINK_FILTER_OPS as readonly string[]).includes(op)) {
      throw Object.assign(new Error(`Invalid filter op: ${String(raw.op)}`), {
        status: 400
      });
    }
    if (op === 'in') {
      if (!Array.isArray(raw.value) || raw.value.length === 0) {
        throw Object.assign(
          new Error('Filter op "in" requires a non-empty array value'),
          { status: 400 }
        );
      }
      normalized.push({ field_id: fieldId, op, value: raw.value });
    } else {
      if (
        raw.value === undefined ||
        raw.value === null ||
        (typeof raw.value === 'string' && raw.value.trim() === '')
      ) {
        throw Object.assign(
          new Error(`Filter op "${op}" requires a non-empty value`),
          { status: 400 }
        );
      }
      normalized.push({ field_id: fieldId, op, value: raw.value });
    }
  }
  return normalized;
}

function getMetaTableRaw(id: string): MetaTableRecord | null {
  return (
    (getDB()
      .prepare('SELECT * FROM meta_tables WHERE id = ?')
      .get(id) as MetaTableRecord | undefined) || null
  );
}

function getMetaFieldRaw(id: string): MetaFieldRecord | null {
  return (
    (getDB()
      .prepare('SELECT * FROM meta_fields WHERE id = ?')
      .get(id) as MetaFieldRecord | undefined) || null
  );
}

function listShardsForTable(tableId: string): MetaShardRecord[] {
  return getDB()
    .prepare(
      'SELECT * FROM meta_shards WHERE table_id = ? ORDER BY shard_no ASC'
    )
    .all(tableId) as MetaShardRecord[];
}

function getShard(id: string): MetaShardRecord | null {
  return (
    (getDB()
      .prepare('SELECT * FROM meta_shards WHERE id = ?')
      .get(id) as MetaShardRecord | undefined) || null
  );
}

function sumRecordCount(tableId: string): number {
  const row = getDB()
    .prepare(
      'SELECT COALESCE(SUM(row_count), 0) AS c FROM meta_shards WHERE table_id = ?'
    )
    .get(tableId) as { c: number };
  return row.c;
}

function fieldCount(tableId: string): number {
  const row = getDB()
    .prepare('SELECT COUNT(*) AS c FROM meta_fields WHERE table_id = ?')
    .get(tableId) as { c: number };
  return row.c;
}

function insertSystemFields(tableId: string, now: string): void {
  const db = getDB();
  const stmt = db.prepare(
    `INSERT INTO meta_fields
     (id, table_id, name, type, validator, config_json, is_system, sort, created_at, updated_at)
     VALUES
     (@id, @table_id, @name, @type, @validator, @config_json, @is_system, @sort, @created_at, @updated_at)`
  );
  for (const def of SYSTEM_FIELD_DEFS) {
    stmt.run({
      id: newId(),
      table_id: tableId,
      name: def.name,
      type: def.type,
      validator: '',
      config_json: '{}',
      is_system: 1,
      sort: def.sort,
      created_at: now,
      updated_at: now
    });
  }
}

function insertShard(tableId: string, shardNo: number, now: string): MetaShardRecord {
  const physical = physicalTableName(tableId, shardNo);
  createCellShardTable(physical);
  const row: MetaShardRecord = {
    id: newId(),
    table_id: tableId,
    shard_no: shardNo,
    physical_table: physical,
    row_count: 0,
    capacity: META_SHARD_DEFAULT_CAPACITY,
    status: 'active',
    created_at: now
  };
  getDB()
    .prepare(
      `INSERT INTO meta_shards
       (id, table_id, shard_no, physical_table, row_count, capacity, status, created_at)
       VALUES
       (@id, @table_id, @shard_no, @physical_table, @row_count, @capacity, @status, @created_at)`
    )
    .run(row);
  return row;
}

function deleteCellsByFieldId(tableId: string, fieldId: string): void {
  const db = getDB();
  for (const shard of listShardsForTable(tableId)) {
    const q = quoteIdent(shard.physical_table);
    db.prepare(`DELETE FROM ${q} WHERE field_id = ?`).run(fieldId);
  }
}

function assertSameAppTarget(
  sourceAppId: string,
  targetTableId: string
): MetaTableRecord {
  const target = getMetaTableRaw(targetTableId);
  if (!target) {
    throw Object.assign(new Error('Target table not found'), { status: 404 });
  }
  if (target.app_id !== sourceAppId) {
    throw Object.assign(
      new Error('Link target table must belong to the same app'),
      { status: 400 }
    );
  }
  return target;
}

function ensureScopedTable(
  appId: string | null,
  tableId: string
): MetaTableRecord {
  const table = getMetaTableRaw(tableId);
  if (!table) {
    throw Object.assign(new Error('Not Found'), { status: 404 });
  }
  if (appId && table.app_id !== appId) {
    throw Object.assign(new Error('Not Found'), { status: 404 });
  }
  return table;
}

function ensureScopedField(
  appId: string | null,
  fieldId: string
): { field: MetaFieldRecord; table: MetaTableRecord } {
  const field = getMetaFieldRaw(fieldId);
  if (!field) {
    throw Object.assign(new Error('Not Found'), { status: 404 });
  }
  const table = ensureScopedTable(appId, field.table_id);
  return { field, table };
}

export function createMetaTable(input: CreateMetaTableInput): MetaTableRecord {
  return withTransaction(() => {
    const now = nowISO();
    const row: MetaTableRecord = {
      id: newId(),
      app_id: input.app_id,
      name: input.name,
      description: input.description || '',
      status: 'active',
      created_at: now,
      updated_at: now
    };
    getDB()
      .prepare(
        `INSERT INTO meta_tables
         (id, app_id, name, description, status, created_at, updated_at)
         VALUES
         (@id, @app_id, @name, @description, @status, @created_at, @updated_at)`
      )
      .run(row);
    insertSystemFields(row.id, now);
    insertShard(row.id, 1, now);
    return row;
  });
}

export function listMetaTables(
  appId: string | null,
  options: ListMetaTablesOptions = {}
): PaginatedResult<MetaTableListItem> {
  const page = options.page && options.page > 0 ? options.page : 1;
  const size =
    options.size && options.size > 0 ? Math.min(options.size, 100) : 20;
  const offset = (page - 1) * size;

  const params: unknown[] = [];
  let where = '1=1';
  if (appId) {
    where += ' AND t.app_id = ?';
    params.push(appId);
  }
  if (options.keyword) {
    where += ' AND (t.name LIKE ? OR t.description LIKE ?)';
    params.push(`%${options.keyword}%`, `%${options.keyword}%`);
  }

  const db = getDB();
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM meta_tables t WHERE ${where}`)
      .get(...params) as { c: number }
  ).c;

  const list = db
    .prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM meta_fields f WHERE f.table_id = t.id) AS field_count,
        (SELECT COALESCE(SUM(s.row_count), 0) FROM meta_shards s WHERE s.table_id = t.id) AS record_count
       FROM meta_tables t
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, size, offset) as Array<
    MetaTableRecord & { field_count: number; record_count: number }
  >;

  return {
    list: list.map((row) => ({
      ...row,
      field_count: Number(row.field_count) || 0,
      record_count: Number(row.record_count) || 0
    })),
    total,
    page,
    size
  };
}

export function getMetaTable(
  appId: string | null,
  id: string
): MetaTableListItem | null {
  try {
    const table = ensureScopedTable(appId, id);
    return {
      ...table,
      field_count: fieldCount(table.id),
      record_count: sumRecordCount(table.id)
    };
  } catch (err) {
    if ((err as { status?: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

export function updateMetaTable(
  appId: string | null,
  id: string,
  input: UpdateMetaTableInput
): MetaTableRecord {
  const table = ensureScopedTable(appId, id);
  const now = nowISO();
  const updated: MetaTableRecord = {
    ...table,
    name: input.name ?? table.name,
    description:
      input.description !== undefined ? input.description : table.description,
    status: input.status ?? table.status,
    updated_at: now
  };
  getDB()
    .prepare(
      `UPDATE meta_tables
       SET name = @name, description = @description, status = @status, updated_at = @updated_at
       WHERE id = @id`
    )
    .run(updated);
  return updated;
}

export function deleteMetaTable(appId: string | null, id: string): boolean {
  return withTransaction(() => {
    const table = ensureScopedTable(appId, id);
    const shards = listShardsForTable(table.id);
    // Drop physical cell tables before deleting meta rows (FK cascades won't DROP them).
    for (const shard of shards) {
      dropCellShardTable(shard.physical_table);
    }
    getDB()
      .prepare('DELETE FROM meta_record_index WHERE table_id = ?')
      .run(table.id);
    const result = getDB()
      .prepare('DELETE FROM meta_tables WHERE id = ?')
      .run(table.id);
    return result.changes > 0;
  });
}

export function listMetaFields(
  appId: string | null,
  tableId: string
): MetaFieldRecord[] {
  ensureScopedTable(appId, tableId);
  return getDB()
    .prepare(
      'SELECT * FROM meta_fields WHERE table_id = ? ORDER BY sort ASC, created_at ASC'
    )
    .all(tableId) as MetaFieldRecord[];
}

export function getMetaField(
  appId: string | null,
  fieldId: string
): MetaFieldRecord | null {
  try {
    return ensureScopedField(appId, fieldId).field;
  } catch (err) {
    if ((err as { status?: number }).status === 404) {
      return null;
    }
    throw err;
  }
}

export function createMetaField(
  appId: string | null,
  tableId: string,
  input: CreateMetaFieldInput
): MetaFieldRecord {
  assertUserFieldType(input.type);
  const table = ensureScopedTable(appId, tableId);

  return withTransaction(() => {
    const now = nowISO();
    let config = normalizeLinkAttachmentConfig(input.type, input.config || {});

    if (input.type === 'one_way_link' || input.type === 'two_way_link') {
      if (!config.target_table_id) {
        throw Object.assign(
          new Error('target_table_id is required for link fields'),
          { status: 400 }
        );
      }
      assertSameAppTarget(table.app_id, config.target_table_id);
      if (config.link_scope === 'filter') {
        config.filters = assertLinkFilters(
          config.target_table_id,
          config.filters
        );
      }
    }

    if (input.type === 'parent_record') {
      config = { ...config, target_table_id: table.id };
    }

    const maxSortRow = getDB()
      .prepare(
        'SELECT COALESCE(MAX(sort), -1) AS m FROM meta_fields WHERE table_id = ?'
      )
      .get(tableId) as { m: number };
    const sort =
      typeof input.sort === 'number' ? input.sort : Number(maxSortRow.m) + 1;

    const field: MetaFieldRecord = {
      id: newId(),
      table_id: tableId,
      name: input.name,
      type: input.type,
      validator: input.validator || '',
      config_json: serializeConfig(config),
      is_system: 0,
      sort,
      created_at: now,
      updated_at: now
    };

    getDB()
      .prepare(
        `INSERT INTO meta_fields
         (id, table_id, name, type, validator, config_json, is_system, sort, created_at, updated_at)
         VALUES
         (@id, @table_id, @name, @type, @validator, @config_json, @is_system, @sort, @created_at, @updated_at)`
      )
      .run(field);

    if (input.type === 'two_way_link' && config.target_table_id) {
      const reverseId = newId();
      const reverseName = `${input.name}_reverse`;
      const reverseConfig: MetaFieldConfig = {
        target_table_id: table.id,
        reverse_field_id: field.id,
        multiple: true,
        link_scope: 'all'
      };
      const reverseMax = getDB()
        .prepare(
          'SELECT COALESCE(MAX(sort), -1) AS m FROM meta_fields WHERE table_id = ?'
        )
        .get(config.target_table_id) as { m: number };
      getDB()
        .prepare(
          `INSERT INTO meta_fields
           (id, table_id, name, type, validator, config_json, is_system, sort, created_at, updated_at)
           VALUES
           (@id, @table_id, @name, @type, @validator, @config_json, @is_system, @sort, @created_at, @updated_at)`
        )
        .run({
          id: reverseId,
          table_id: config.target_table_id,
          name: reverseName,
          type: 'two_way_link',
          validator: '',
          config_json: serializeConfig(reverseConfig),
          is_system: 0,
          sort: Number(reverseMax.m) + 1,
          created_at: now,
          updated_at: now
        });

      config.reverse_field_id = reverseId;
      field.config_json = serializeConfig(config);
      getDB()
        .prepare(
          'UPDATE meta_fields SET config_json = @config_json, updated_at = @updated_at WHERE id = @id'
        )
        .run({
          id: field.id,
          config_json: field.config_json,
          updated_at: now
        });
    }

    return field;
  });
}

export function updateMetaField(
  appId: string | null,
  fieldId: string,
  input: UpdateMetaFieldInput
): MetaFieldRecord {
  const { field, table } = ensureScopedField(appId, fieldId);
  if (field.is_system) {
    throw Object.assign(new Error('System fields cannot be modified'), {
      status: 400
    });
  }

  if (input.type) {
    assertUserFieldType(input.type);
  }

  const nextType = (input.type || field.type) as MetaFieldType;
  let config = normalizeLinkAttachmentConfig(
    nextType,
    input.config !== undefined ? input.config : parseConfig(field.config_json)
  );

  if (nextType === 'one_way_link' || nextType === 'two_way_link') {
    if (!config.target_table_id) {
      throw Object.assign(
        new Error('target_table_id is required for link fields'),
        { status: 400 }
      );
    }
    assertSameAppTarget(table.app_id, config.target_table_id);
    if (config.link_scope === 'filter') {
      config.filters = assertLinkFilters(
        config.target_table_id,
        config.filters
      );
    }
  }
  if (nextType === 'parent_record') {
    config = { ...config, target_table_id: table.id };
  }

  // Preserve reverse_field_id for existing two_way_link unless explicitly overwritten.
  if (field.type === 'two_way_link' && nextType === 'two_way_link') {
    const prev = parseConfig(field.config_json);
    if (prev.reverse_field_id && !config.reverse_field_id) {
      config.reverse_field_id = prev.reverse_field_id;
    }
  }

  const now = nowISO();
  const updated: MetaFieldRecord = {
    ...field,
    name: input.name ?? field.name,
    type: nextType,
    validator: input.validator !== undefined ? input.validator : field.validator,
    config_json: serializeConfig(config),
    sort: typeof input.sort === 'number' ? input.sort : field.sort,
    updated_at: now
  };

  getDB()
    .prepare(
      `UPDATE meta_fields
       SET name = @name, type = @type, validator = @validator,
           config_json = @config_json, sort = @sort, updated_at = @updated_at
       WHERE id = @id`
    )
    .run(updated);

  return updated;
}

export function deleteMetaField(
  appId: string | null,
  fieldId: string
): boolean {
  return withTransaction(() => {
    const { field } = ensureScopedField(appId, fieldId);
    if (field.is_system) {
      throw Object.assign(new Error('System fields cannot be deleted'), {
        status: 400
      });
    }

    const config = parseConfig(field.config_json);

    // Cascade-delete reverse two_way_link field first (avoid recursion loop).
    if (field.type === 'two_way_link' && config.reverse_field_id) {
      const reverse = getMetaFieldRaw(config.reverse_field_id);
      if (reverse && reverse.id !== field.id) {
        deleteCellsByFieldId(reverse.table_id, reverse.id);
        // Clear reverse pointer so reverse delete does not recurse.
        getDB()
          .prepare(
            `UPDATE meta_fields SET config_json = ? WHERE id = ?`
          )
          .run(
            serializeConfig({
              ...parseConfig(reverse.config_json),
              reverse_field_id: undefined
            }),
            reverse.id
          );
        getDB()
          .prepare('DELETE FROM meta_fields WHERE id = ?')
          .run(reverse.id);
      }
    }

    deleteCellsByFieldId(field.table_id, field.id);
    const result = getDB()
      .prepare('DELETE FROM meta_fields WHERE id = ?')
      .run(field.id);
    return result.changes > 0;
  });
}

export function listMetaRecords(
  appId: string | null,
  options: ListMetaRecordsOptions = {}
): PaginatedResult<MetaRecordIndexRecord> {
  const page = options.page && options.page > 0 ? options.page : 1;
  const size =
    options.size && options.size > 0 ? Math.min(options.size, 100) : 20;
  const offset = (page - 1) * size;

  const params: unknown[] = [];
  let where = '1=1';
  if (appId) {
    where += ' AND app_id = ?';
    params.push(appId);
  }
  if (options.table_id) {
    where += ' AND table_id = ?';
    params.push(options.table_id);
  }

  const db = getDB();
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM meta_record_index WHERE ${where}`)
      .get(...params) as { c: number }
  ).c;
  const list = db
    .prepare(
      `SELECT * FROM meta_record_index WHERE ${where}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, size, offset) as MetaRecordIndexRecord[];

  return { list, total, page, size };
}

export interface MetaRecordDetail {
  record_id: string;
  app_id: string;
  table_id: string;
  shard_id: string;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
  /** Dynamic field values keyed by field name (system fields merged in). */
  data: Record<string, unknown>;
  fields: Array<{
    id: string;
    name: string;
    type: MetaFieldType;
    validator: string;
    config: MetaFieldConfig;
    is_system: boolean;
    sort: number;
  }>;
}

export function getMetaRecord(
  appId: string | null,
  recordId: string
): MetaRecordDetail | null {
  const db = getDB();
  let index: MetaRecordIndexRecord | undefined;
  if (appId) {
    index = db
      .prepare(
        'SELECT * FROM meta_record_index WHERE record_id = ? AND app_id = ?'
      )
      .get(recordId, appId) as MetaRecordIndexRecord | undefined;
  } else {
    index = db
      .prepare('SELECT * FROM meta_record_index WHERE record_id = ?')
      .get(recordId) as MetaRecordIndexRecord | undefined;
  }
  if (!index) {
    return null;
  }

  const shard = getShard(index.shard_id);
  if (!shard) {
    return null;
  }

  const fields = listMetaFields(appId, index.table_id);
  const fieldById = new Map(fields.map((f) => [f.id, f]));

  const cells = db
    .prepare(
      `SELECT field_id, value FROM ${quoteIdent(shard.physical_table)} WHERE record_id = ?`
    )
    .all(recordId) as Array<{ field_id: string; value: string | null }>;

  const data: Record<string, unknown> = {
    created_by: index.created_by,
    updated_by: index.updated_by,
    created_at: index.created_at,
    updated_at: index.updated_at
  };

  for (const cell of cells) {
    const field = fieldById.get(cell.field_id);
    if (!field || field.is_system) {
      continue;
    }
    data[field.name] = parseCellValue(cell.value);
  }

  return {
    ...index,
    data,
    fields: fields.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      validator: f.validator,
      config: parseConfig(f.config_json),
      is_system: !!f.is_system,
      sort: f.sort
    }))
  };
}

/** Test / seed helper: insert a record anchor + optional cells (same transaction). */
export function insertMetaRecordForTest(input: {
  app_id: string;
  table_id: string;
  record_id?: string;
  created_by?: string;
  updated_by?: string;
  cells?: Array<{ field_id: string; value: unknown }>;
}): MetaRecordIndexRecord {
  return withTransaction(() => {
    const shards = listShardsForTable(input.table_id);
    const active =
      shards.find((s) => s.status === 'active') || shards[shards.length - 1];
    if (!active) {
      throw new Error('No shard available');
    }

    const now = Date.now();
    const row: MetaRecordIndexRecord = {
      record_id: input.record_id || newId(),
      app_id: input.app_id,
      table_id: input.table_id,
      shard_id: active.id,
      created_by: input.created_by || '',
      updated_by: input.updated_by || '',
      created_at: now,
      updated_at: now
    };

    getDB()
      .prepare(
        `INSERT INTO meta_record_index
         (record_id, app_id, table_id, shard_id, created_by, updated_by, created_at, updated_at)
         VALUES
         (@record_id, @app_id, @table_id, @shard_id, @created_by, @updated_by, @created_at, @updated_at)`
      )
      .run(row);

    if (input.cells?.length) {
      const q = quoteIdent(active.physical_table);
      const stmt = getDB().prepare(
        `INSERT INTO ${q} (record_id, field_id, value, updated_at)
         VALUES (?, ?, ?, ?)`
      );
      for (const cell of input.cells) {
        stmt.run(
          row.record_id,
          cell.field_id,
          JSON.stringify(cell.value),
          now
        );
      }
    }

    getDB()
      .prepare(
        'UPDATE meta_shards SET row_count = row_count + 1 WHERE id = ?'
      )
      .run(active.id);

    return row;
  });
}

export function listShards(tableId: string): MetaShardRecord[] {
  return listShardsForTable(tableId);
}

export function parseMetaFieldConfig(configJson: string): MetaFieldConfig {
  return parseConfig(configJson);
}
