import mysql from 'mysql2/promise';
import { Client as PgClient } from 'pg';
import oracledb from 'oracledb';
import sql from 'mssql';
import { HttpError } from '@axiosleo/koapp';
import type {
  ColumnDefinition,
  DatasourceProtocol,
  DatasourceType,
  TableInfo
} from '../types';
import { DATASOURCE_TYPES, datasourceProtocol } from '../types';
import { splitSqlStatements } from './sql-text';

export interface DatasourceConfig {
  type: DatasourceType;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message?: string;
  latency_ms?: number;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  row_count: number;
}

export interface ExecuteResult {
  affected_rows: number;
  insert_id?: number;
}

export type ScriptStatementResult =
  | { kind: 'query'; rows: Record<string, unknown>[]; row_count: number }
  | { kind: 'execute'; affected_rows: number; insert_id?: number };

export interface ScriptResult {
  results: ScriptStatementResult[];
}

/**
 * Per-datasource driver surface. Protocol-compatible types share a base
 * adapter; individual types may override methods later via the registry.
 */
export interface DatasourceAdapter {
  testConnection(config: DatasourceConfig): Promise<TestConnectionResult>;
  listTables(config: DatasourceConfig): Promise<TableInfo[]>;
  describeTables(
    config: DatasourceConfig,
    tables: string[]
  ): Promise<Record<string, { comment: string; columns: ColumnDefinition[] }>>;
  query(
    config: DatasourceConfig,
    sql: string,
    params?: Record<string, unknown>
  ): Promise<QueryResult>;
  execute(
    config: DatasourceConfig,
    sql: string,
    params?: Record<string, unknown>
  ): Promise<ExecuteResult>;
  executeScript(
    config: DatasourceConfig,
    sql: string,
    params?: Record<string, unknown>
  ): Promise<ScriptResult>;
}

const CONNECT_TIMEOUT_MS = 5000;

/**
 * Convert named `:param` placeholders to PostgreSQL `$n` style.
 * Skips PostgreSQL `::type` casts and content inside single/double quotes.
 */
export function convertNamedParams(
  sql: string,
  params: Record<string, unknown>
): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const indexByName = new Map<string, number>();
  let result = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingle) {
      result += ch;
      if (ch === "'" && next === "'") {
        result += next;
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      i += 1;
      continue;
    }

    if (inDouble) {
      result += ch;
      if (ch === '"' && next === '"') {
        result += next;
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
      }
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      result += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      result += ch;
      i += 1;
      continue;
    }

    // Skip PostgreSQL type cast ::type
    if (ch === ':' && next === ':') {
      result += '::';
      i += 2;
      continue;
    }

    if (ch === ':' && next && /[A-Za-z_]/.test(next)) {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) {
        j += 1;
      }
      const name = sql.slice(i + 1, j);
      if (!(name in params)) {
        throw new HttpError(400, `Missing SQL parameter: ${name}`);
      }
      let idx = indexByName.get(name);
      if (idx === undefined) {
        values.push(params[name]);
        idx = values.length;
        indexByName.set(name, idx);
      }
      result += `$${idx}`;
      i = j;
      continue;
    }

    result += ch;
    i += 1;
  }

  return { text: result, values };
}

/**
 * Convert named `:param` placeholders to SQL Server `@param` style.
 * Skips content inside single/double quotes and brackets.
 */
export function convertNamedParamsToAt(
  sql: string,
  params: Record<string, unknown>
): { text: string; names: string[] } {
  const names: string[] = [];
  const seen = new Set<string>();
  let result = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inBracket = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingle) {
      result += ch;
      if (ch === "'" && next === "'") {
        result += next;
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      i += 1;
      continue;
    }

    if (inDouble) {
      result += ch;
      if (ch === '"' && next === '"') {
        result += next;
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
      }
      i += 1;
      continue;
    }

    if (inBracket) {
      result += ch;
      if (ch === ']') {
        inBracket = false;
      }
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      result += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      result += ch;
      i += 1;
      continue;
    }
    if (ch === '[') {
      inBracket = true;
      result += ch;
      i += 1;
      continue;
    }

    // Skip PostgreSQL-style :: casts if present
    if (ch === ':' && next === ':') {
      result += '::';
      i += 2;
      continue;
    }

    if (ch === ':' && next && /[A-Za-z_]/.test(next)) {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) {
        j += 1;
      }
      const name = sql.slice(i + 1, j);
      if (!(name in params)) {
        throw new HttpError(400, `Missing SQL parameter: ${name}`);
      }
      if (!seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
      result += `@${name}`;
      i = j;
      continue;
    }

    result += ch;
    i += 1;
  }

  return { text: result, names };
}

function wrapDatasourceError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  throw new HttpError(502, `Datasource Error: ${message}`);
}

async function withMysql<T>(
  config: DatasourceConfig,
  fn: (conn: mysql.Connection) => Promise<T>
): Promise<T> {
  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: config.database,
      connectTimeout: CONNECT_TIMEOUT_MS,
      namedPlaceholders: true
    });
    return await fn(conn);
  } catch (err) {
    return wrapDatasourceError(err);
  } finally {
    if (conn) {
      await conn.end().catch(() => undefined);
    }
  }
}

async function withPg<T>(
  config: DatasourceConfig,
  fn: (client: PgClient) => Promise<T>
): Promise<T> {
  const client = new PgClient({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS
  });
  try {
    await client.connect();
    return await fn(client);
  } catch (err) {
    return wrapDatasourceError(err);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function listTablesMysql(config: DatasourceConfig): Promise<TableInfo[]> {
  return withMysql(config, async (conn) => {
    const [rows] = await conn.query(
      `SELECT TABLE_NAME AS name, IFNULL(TABLE_COMMENT, '') AS comment
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [config.database]
    );
    return (rows as Array<{ name: string; comment: string }>).map((r) => ({
      name: r.name,
      comment: r.comment || ''
    }));
  });
}

async function listTablesPg(config: DatasourceConfig): Promise<TableInfo[]> {
  return withPg(config, async (client) => {
    const result = await client.query(
      `SELECT c.relname AS name,
              COALESCE(obj_description(c.oid), '') AS comment
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
       ORDER BY c.relname`
    );
    return result.rows.map((r) => ({
      name: r.name as string,
      comment: (r.comment as string) || ''
    }));
  });
}

async function describeTablesMysql(
  config: DatasourceConfig,
  tables: string[]
): Promise<Record<string, { comment: string; columns: ColumnDefinition[] }>> {
  if (tables.length === 0) {
    return {};
  }

  return withMysql(config, async (conn) => {
    const placeholders = tables.map(() => '?').join(',');
    const [tableRows] = await conn.query(
      `SELECT TABLE_NAME AS name, IFNULL(TABLE_COMMENT, '') AS comment
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders})`,
      [config.database, ...tables]
    );
    const [colRows] = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE,
              COLUMN_DEFAULT, IFNULL(COLUMN_COMMENT, '') AS COLUMN_COMMENT,
              COLUMN_KEY, EXTRA
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (${placeholders})
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [config.database, ...tables]
    );

    const result: Record<string, { comment: string; columns: ColumnDefinition[] }> = {};
    for (const t of tableRows as Array<{ name: string; comment: string }>) {
      result[t.name] = { comment: t.comment || '', columns: [] };
    }
    for (const c of colRows as Array<{
      TABLE_NAME: string;
      COLUMN_NAME: string;
      COLUMN_TYPE: string;
      IS_NULLABLE: string;
      COLUMN_DEFAULT: string | null;
      COLUMN_COMMENT: string;
      COLUMN_KEY: string;
      EXTRA: string;
    }>) {
      if (!result[c.TABLE_NAME]) {
        result[c.TABLE_NAME] = { comment: '', columns: [] };
      }
      result[c.TABLE_NAME].columns.push({
        name: c.COLUMN_NAME,
        type: c.COLUMN_TYPE,
        nullable: c.IS_NULLABLE === 'YES',
        default: c.COLUMN_DEFAULT,
        comment: c.COLUMN_COMMENT || '',
        is_primary: c.COLUMN_KEY === 'PRI',
        is_auto_increment: (c.EXTRA || '').toLowerCase().includes('auto_increment')
      });
    }
    return result;
  });
}

async function describeTablesPg(
  config: DatasourceConfig,
  tables: string[]
): Promise<Record<string, { comment: string; columns: ColumnDefinition[] }>> {
  if (tables.length === 0) {
    return {};
  }

  return withPg(config, async (client) => {
    const result: Record<string, { comment: string; columns: ColumnDefinition[] }> = {};

    const tableResult = await client.query(
      `SELECT c.relname AS name,
              COALESCE(obj_description(c.oid), '') AS comment
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relname = ANY($1::text[])`,
      [tables]
    );
    for (const t of tableResult.rows) {
      result[t.name as string] = { comment: (t.comment as string) || '', columns: [] };
    }

    const colResult = await client.query(
      `SELECT
         cols.table_name,
         cols.column_name,
         cols.data_type,
         cols.udt_name,
         cols.is_nullable,
         cols.column_default,
         cols.is_identity,
         COALESCE(col_description(cls.oid, cols.ordinal_position::int), '') AS comment,
         CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary
       FROM information_schema.columns cols
       JOIN pg_class cls ON cls.relname = cols.table_name
       JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace AND nsp.nspname = cols.table_schema
       LEFT JOIN (
         SELECT kcu.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_schema = 'public'
       ) pk ON pk.table_name = cols.table_name AND pk.column_name = cols.column_name
       WHERE cols.table_schema = 'public'
         AND cols.table_name = ANY($1::text[])
       ORDER BY cols.table_name, cols.ordinal_position`,
      [tables]
    );

    for (const c of colResult.rows) {
      const tableName = c.table_name as string;
      if (!result[tableName]) {
        result[tableName] = { comment: '', columns: [] };
      }
      const defaultVal = c.column_default as string | null;
      const isIdentity = (c.is_identity as string) === 'YES';
      const isSerial = typeof defaultVal === 'string' && defaultVal.startsWith('nextval(');
      result[tableName].columns.push({
        name: c.column_name as string,
        type: (c.udt_name as string) || (c.data_type as string),
        nullable: (c.is_nullable as string) === 'YES',
        default: defaultVal,
        comment: (c.comment as string) || '',
        is_primary: Boolean(c.is_primary),
        is_auto_increment: isIdentity || isSerial
      });
    }

    return result;
  });
}

function looksLikeQuery(sql: string): boolean {
  let cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  cleaned = cleaned.replace(/--[^\n]*/g, ' ');
  cleaned = cleaned.replace(/#[^\n]*/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (/^WITH\b/i.test(cleaned)) {
    // CTE — treat as query unless a write verb appears at depth 0
    let depth = 0;
    for (let i = 0; i < cleaned.length; i += 1) {
      const ch = cleaned[i];
      if (ch === '(') {
        depth += 1;
        continue;
      }
      if (ch === ')') {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (depth === 0) {
        const slice = cleaned.slice(i);
        if (/^(INSERT|UPDATE|DELETE|CALL|DO|EXECUTE|EXEC)\b/i.test(slice)) {
          return false;
        }
        if (/^SELECT\b/i.test(slice)) {
          return true;
        }
      }
    }
    return true;
  }

  return /^(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\b/i.test(cleaned);
}

const mysqlAdapter: DatasourceAdapter = {
  async testConnection(config) {
    const started = Date.now();
    try {
      await withMysql(config, async (conn) => {
        await conn.query('SELECT 1');
      });
      return {
        ok: true,
        message: 'Connected',
        latency_ms: Date.now() - started
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message,
        latency_ms: Date.now() - started
      };
    }
  },

  listTables: listTablesMysql,
  describeTables: describeTablesMysql,

  async query(config, sql, params = {}) {
    return withMysql(config, async (conn) => {
      // namedPlaceholders: true — values is a name→value map
      const [rows] = await conn.query(sql, params as never);
      const list = rows as Record<string, unknown>[];
      return { rows: list, row_count: list.length };
    });
  },

  async execute(config, sql, params = {}) {
    return withMysql(config, async (conn) => {
      const [result] = await conn.execute(sql, params as never);
      const header = result as mysql.ResultSetHeader;
      return {
        affected_rows: header.affectedRows || 0,
        insert_id: header.insertId || undefined
      };
    });
  },

  async executeScript(config, sql, params = {}) {
    const statements = splitSqlStatements(sql);
    if (statements.length === 0) {
      throw new HttpError(400, 'Empty SQL script');
    }

    return withMysql(config, async (conn) => {
      await conn.beginTransaction();
      try {
        const results: ScriptStatementResult[] = [];
        for (const stmt of statements) {
          const [raw] = await conn.query(stmt, params as never);
          if (looksLikeQuery(stmt) && Array.isArray(raw)) {
            const rows = raw as Record<string, unknown>[];
            results.push({ kind: 'query', rows, row_count: rows.length });
          } else {
            const header = raw as mysql.ResultSetHeader;
            results.push({
              kind: 'execute',
              affected_rows: header.affectedRows || 0,
              insert_id: header.insertId || undefined
            });
          }
        }
        await conn.commit();
        return { results };
      } catch (err) {
        await conn.rollback().catch(() => undefined);
        throw err;
      }
    });
  }
};

const pgAdapter: DatasourceAdapter = {
  async testConnection(config) {
    const started = Date.now();
    try {
      await withPg(config, async (client) => {
        await client.query('SELECT 1');
      });
      return {
        ok: true,
        message: 'Connected',
        latency_ms: Date.now() - started
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message,
        latency_ms: Date.now() - started
      };
    }
  },

  listTables: listTablesPg,
  describeTables: describeTablesPg,

  async query(config, sql, params = {}) {
    const { text, values } = convertNamedParams(sql, params);
    return withPg(config, async (client) => {
      const result = await client.query(text, values);
      return {
        rows: result.rows as Record<string, unknown>[],
        row_count: result.rowCount ?? result.rows.length
      };
    });
  },

  async execute(config, sql, params = {}) {
    const { text, values } = convertNamedParams(sql, params);
    return withPg(config, async (client) => {
      const result = await client.query(text, values);
      return {
        affected_rows: result.rowCount ?? 0
      };
    });
  },

  async executeScript(config, sql, params = {}) {
    const statements = splitSqlStatements(sql);
    if (statements.length === 0) {
      throw new HttpError(400, 'Empty SQL script');
    }

    return withPg(config, async (client) => {
      await client.query('BEGIN');
      try {
        const results: ScriptStatementResult[] = [];
        for (const stmt of statements) {
          const { text, values } = convertNamedParams(stmt, params);
          const result = await client.query(text, values);
          if (looksLikeQuery(stmt) && Array.isArray(result.rows)) {
            results.push({
              kind: 'query',
              rows: result.rows as Record<string, unknown>[],
              row_count: result.rowCount ?? result.rows.length
            });
          } else {
            results.push({
              kind: 'execute',
              affected_rows: result.rowCount ?? 0
            });
          }
        }
        await client.query('COMMIT');
        return { results };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    });
  }
};

async function withOracle<T>(
  config: DatasourceConfig,
  fn: (conn: oracledb.Connection) => Promise<T>
): Promise<T> {
  let conn: oracledb.Connection | null = null;
  try {
    conn = await oracledb.getConnection({
      user: config.username,
      password: config.password,
      connectString: `${config.host}:${config.port}/${config.database}`,
      // oracledb connectTimeout is in seconds
      connectTimeout: Math.ceil(CONNECT_TIMEOUT_MS / 1000)
    });
    return await fn(conn);
  } catch (err) {
    return wrapDatasourceError(err);
  } finally {
    if (conn) {
      await conn.close().catch(() => undefined);
    }
  }
}

async function withMssql<T>(
  config: DatasourceConfig,
  fn: (pool: sql.ConnectionPool) => Promise<T>
): Promise<T> {
  const pool = new sql.ConnectionPool({
    server: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: config.database,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    requestTimeout: CONNECT_TIMEOUT_MS * 6,
    options: {
      encrypt: true,
      trustServerCertificate: true
    }
  });
  try {
    await pool.connect();
    return await fn(pool);
  } catch (err) {
    return wrapDatasourceError(err);
  } finally {
    await pool.close().catch(() => undefined);
  }
}

function bindMssqlInputs(
  request: sql.Request,
  names: string[],
  params: Record<string, unknown>
): void {
  for (const name of names) {
    request.input(name, params[name] as never);
  }
}

async function mssqlQuery(
  poolOrTx: sql.ConnectionPool | sql.Transaction,
  sqlText: string,
  params: Record<string, unknown>
): Promise<{ recordset: Record<string, unknown>[]; rowsAffected: number[] }> {
  const { text, names } = convertNamedParamsToAt(sqlText, params);
  const request =
    poolOrTx instanceof sql.Transaction
      ? new sql.Request(poolOrTx)
      : poolOrTx.request();
  bindMssqlInputs(request, names, params);
  const result = await request.query(text);
  return {
    recordset: (result.recordset || []) as Record<string, unknown>[],
    rowsAffected: result.rowsAffected || []
  };
}

/** Collect `:name` placeholders (skips `::` casts) and ensure params exist. */
function assertNamedParamsPresent(
  sqlText: string,
  params: Record<string, unknown>
): void {
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  while (i < sqlText.length) {
    const ch = sqlText[i];
    const next = sqlText[i + 1];
    if (inSingle) {
      if (ch === "'" && next === "'") {
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && next === '"') {
        i += 2;
        continue;
      }
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i += 1;
      continue;
    }
    if (ch === ':' && next === ':') {
      i += 2;
      continue;
    }
    if (ch === ':' && next && /[A-Za-z_]/.test(next)) {
      let j = i + 1;
      while (j < sqlText.length && /[A-Za-z0-9_]/.test(sqlText[j])) {
        j += 1;
      }
      const name = sqlText.slice(i + 1, j);
      if (!(name in params)) {
        throw new HttpError(400, `Missing SQL parameter: ${name}`);
      }
      i = j;
      continue;
    }
    i += 1;
  }
}

const oracleAdapter: DatasourceAdapter = {
  async testConnection(config) {
    const started = Date.now();
    try {
      await withOracle(config, async (conn) => {
        await conn.execute('SELECT 1 FROM DUAL');
      });
      return {
        ok: true,
        message: 'Connected',
        latency_ms: Date.now() - started
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message,
        latency_ms: Date.now() - started
      };
    }
  },

  async listTables(config) {
    return withOracle(config, async (conn) => {
      const result = await conn.execute<{ NAME: string; COMMENT: string }>(
        `SELECT t.table_name AS name,
                NVL(c.comments, '') AS comment
         FROM user_tables t
         LEFT JOIN user_tab_comments c ON c.table_name = t.table_name
         ORDER BY t.table_name`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return (result.rows || []).map((r) => ({
        name: r.NAME,
        comment: r.COMMENT || ''
      }));
    });
  },

  async describeTables(config, tables) {
    if (tables.length === 0) {
      return {};
    }
    return withOracle(config, async (conn) => {
      const result: Record<
        string,
        { comment: string; columns: ColumnDefinition[] }
      > = {};
      const upperTables = tables.map((t) => t.toUpperCase());

      const commentResult = await conn.execute<{
        TABLE_NAME: string;
        COMMENTS: string | null;
      }>(
        `SELECT table_name, comments
         FROM user_tab_comments
         WHERE table_name IN (${upperTables.map((_, i) => `:t${i}`).join(',')})`,
        Object.fromEntries(upperTables.map((t, i) => [`t${i}`, t])),
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      for (const row of commentResult.rows || []) {
        result[row.TABLE_NAME] = {
          comment: row.COMMENTS || '',
          columns: []
        };
      }
      for (const name of upperTables) {
        if (!result[name]) {
          result[name] = { comment: '', columns: [] };
        }
      }

      const pkResult = await conn.execute<{
        TABLE_NAME: string;
        COLUMN_NAME: string;
      }>(
        `SELECT cols.table_name, cols.column_name
         FROM user_constraints cons
         JOIN user_cons_columns cols
           ON cons.constraint_name = cols.constraint_name
          AND cons.owner = cols.owner
         WHERE cons.constraint_type = 'P'
           AND cols.table_name IN (${upperTables.map((_, i) => `:t${i}`).join(',')})`,
        Object.fromEntries(upperTables.map((t, i) => [`t${i}`, t])),
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const pkSet = new Set(
        (pkResult.rows || []).map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`)
      );

      const colResult = await conn.execute<{
        TABLE_NAME: string;
        COLUMN_NAME: string;
        DATA_TYPE: string;
        DATA_LENGTH: number | null;
        DATA_PRECISION: number | null;
        DATA_SCALE: number | null;
        NULLABLE: string;
        DATA_DEFAULT: string | null;
        IDENTITY_COLUMN: string;
        COMMENTS: string | null;
      }>(
        `SELECT
           cols.table_name,
           cols.column_name,
           cols.data_type,
           cols.data_length,
           cols.data_precision,
           cols.data_scale,
           cols.nullable,
           cols.data_default,
           NVL(cols.identity_column, 'NO') AS identity_column,
           NVL(cc.comments, '') AS comments
         FROM user_tab_columns cols
         LEFT JOIN user_col_comments cc
           ON cc.table_name = cols.table_name
          AND cc.column_name = cols.column_name
         WHERE cols.table_name IN (${upperTables.map((_, i) => `:t${i}`).join(',')})
         ORDER BY cols.table_name, cols.column_id`,
        Object.fromEntries(upperTables.map((t, i) => [`t${i}`, t])),
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      for (const c of colResult.rows || []) {
        if (!result[c.TABLE_NAME]) {
          result[c.TABLE_NAME] = { comment: '', columns: [] };
        }
        let type = c.DATA_TYPE;
        if (c.DATA_PRECISION != null) {
          type =
            c.DATA_SCALE != null && c.DATA_SCALE > 0
              ? `${c.DATA_TYPE}(${c.DATA_PRECISION},${c.DATA_SCALE})`
              : `${c.DATA_TYPE}(${c.DATA_PRECISION})`;
        } else if (
          c.DATA_LENGTH != null
          && /CHAR|RAW|VARCHAR/i.test(c.DATA_TYPE)
        ) {
          type = `${c.DATA_TYPE}(${c.DATA_LENGTH})`;
        }
        result[c.TABLE_NAME].columns.push({
          name: c.COLUMN_NAME,
          type,
          nullable: c.NULLABLE === 'Y',
          default: c.DATA_DEFAULT,
          comment: c.COMMENTS || '',
          is_primary: pkSet.has(`${c.TABLE_NAME}.${c.COLUMN_NAME}`),
          is_auto_increment: c.IDENTITY_COLUMN === 'YES'
        });
      }

      // Preserve original casing keys when caller passed mixed-case names
      const keyed: typeof result = {};
      for (const original of tables) {
        const upper = original.toUpperCase();
        keyed[original] = result[upper] || { comment: '', columns: [] };
      }
      return keyed;
    });
  },

  async query(config, sqlText, params = {}) {
    return withOracle(config, async (conn) => {
      assertNamedParamsPresent(sqlText, params);
      const result = await conn.execute(sqlText, params, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      const rows = (result.rows || []) as Record<string, unknown>[];
      return { rows, row_count: rows.length };
    });
  },

  async execute(config, sqlText, params = {}) {
    return withOracle(config, async (conn) => {
      assertNamedParamsPresent(sqlText, params);
      const result = await conn.execute(sqlText, params, {
        autoCommit: true,
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      return {
        affected_rows: result.rowsAffected || 0
      };
    });
  },

  async executeScript(config, sqlText, params = {}) {
    const statements = splitSqlStatements(sqlText);
    if (statements.length === 0) {
      throw new HttpError(400, 'Empty SQL script');
    }

    return withOracle(config, async (conn) => {
      const results: ScriptStatementResult[] = [];
      try {
        for (const stmt of statements) {
          assertNamedParamsPresent(stmt, params);
          const result = await conn.execute(stmt, params, {
            autoCommit: false,
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          if (looksLikeQuery(stmt) && Array.isArray(result.rows)) {
            const rows = result.rows as Record<string, unknown>[];
            results.push({ kind: 'query', rows, row_count: rows.length });
          } else {
            results.push({
              kind: 'execute',
              affected_rows: result.rowsAffected || 0
            });
          }
        }
        await conn.commit();
        return { results };
      } catch (err) {
        await conn.rollback().catch(() => undefined);
        throw err;
      }
    });
  }
};

const sqlserverAdapter: DatasourceAdapter = {
  async testConnection(config) {
    const started = Date.now();
    try {
      await withMssql(config, async (pool) => {
        await pool.request().query('SELECT 1');
      });
      return {
        ok: true,
        message: 'Connected',
        latency_ms: Date.now() - started
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        message,
        latency_ms: Date.now() - started
      };
    }
  },

  async listTables(config) {
    return withMssql(config, async (pool) => {
      const result = await pool
        .request()
        .input('db', config.database)
        .query(
          `SELECT TABLE_NAME AS name, '' AS comment
           FROM INFORMATION_SCHEMA.TABLES
           WHERE TABLE_TYPE = 'BASE TABLE'
             AND TABLE_CATALOG = @db
           ORDER BY TABLE_NAME`
        );
      return (result.recordset || []).map((r: { name: string; comment: string }) => ({
        name: r.name,
        comment: r.comment || ''
      }));
    });
  },

  async describeTables(config, tables) {
    if (tables.length === 0) {
      return {};
    }
    return withMssql(config, async (pool) => {
      const result: Record<
        string,
        { comment: string; columns: ColumnDefinition[] }
      > = {};

      const tableReq = pool.request().input('db', config.database);
      tables.forEach((t, i) => tableReq.input(`t${i}`, t));
      const tableRows = await tableReq.query(
        `SELECT t.TABLE_NAME AS name,
                ISNULL(CAST(ep.value AS nvarchar(4000)), '') AS comment
         FROM INFORMATION_SCHEMA.TABLES t
         LEFT JOIN sys.tables st ON st.name = t.TABLE_NAME
         LEFT JOIN sys.extended_properties ep
           ON ep.major_id = st.object_id
          AND ep.minor_id = 0
          AND ep.name = 'MS_Description'
         WHERE t.TABLE_TYPE = 'BASE TABLE'
           AND t.TABLE_CATALOG = @db
           AND t.TABLE_NAME IN (${tables.map((_, i) => `@t${i}`).join(',')})`
      );
      for (const t of tableRows.recordset as Array<{ name: string; comment: string }>) {
        result[t.name] = { comment: t.comment || '', columns: [] };
      }
      for (const name of tables) {
        if (!result[name]) {
          result[name] = { comment: '', columns: [] };
        }
      }

      const colReq = pool.request().input('db', config.database);
      tables.forEach((t, i) => colReq.input(`t${i}`, t));
      const colRows = await colReq.query(
        `SELECT
           c.TABLE_NAME,
           c.COLUMN_NAME,
           c.DATA_TYPE,
           c.CHARACTER_MAXIMUM_LENGTH,
           c.NUMERIC_PRECISION,
           c.NUMERIC_SCALE,
           c.IS_NULLABLE,
           c.COLUMN_DEFAULT,
           CASE WHEN COLUMNPROPERTY(OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME)), c.COLUMN_NAME, 'IsIdentity') = 1
                THEN 1 ELSE 0 END AS is_identity,
           CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_primary,
           ISNULL(CAST(ep.value AS nvarchar(4000)), '') AS comment
         FROM INFORMATION_SCHEMA.COLUMNS c
         LEFT JOIN (
           SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME
           FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
           JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
             ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            AND tc.TABLE_CATALOG = kcu.TABLE_CATALOG
           WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
             AND tc.TABLE_CATALOG = @db
         ) pk ON pk.TABLE_NAME = c.TABLE_NAME AND pk.COLUMN_NAME = c.COLUMN_NAME
         LEFT JOIN sys.tables st ON st.name = c.TABLE_NAME
         LEFT JOIN sys.columns sc ON sc.object_id = st.object_id AND sc.name = c.COLUMN_NAME
         LEFT JOIN sys.extended_properties ep
           ON ep.major_id = st.object_id
          AND ep.minor_id = sc.column_id
          AND ep.name = 'MS_Description'
         WHERE c.TABLE_CATALOG = @db
           AND c.TABLE_NAME IN (${tables.map((_, i) => `@t${i}`).join(',')})
         ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`
      );

      for (const c of colRows.recordset as Array<{
        TABLE_NAME: string;
        COLUMN_NAME: string;
        DATA_TYPE: string;
        CHARACTER_MAXIMUM_LENGTH: number | null;
        NUMERIC_PRECISION: number | null;
        NUMERIC_SCALE: number | null;
        IS_NULLABLE: string;
        COLUMN_DEFAULT: string | null;
        is_identity: number;
        is_primary: number;
        comment: string;
      }>) {
        if (!result[c.TABLE_NAME]) {
          result[c.TABLE_NAME] = { comment: '', columns: [] };
        }
        let type = c.DATA_TYPE;
        if (c.CHARACTER_MAXIMUM_LENGTH != null && c.CHARACTER_MAXIMUM_LENGTH > 0) {
          type = `${c.DATA_TYPE}(${c.CHARACTER_MAXIMUM_LENGTH})`;
        } else if (c.NUMERIC_PRECISION != null) {
          type =
            c.NUMERIC_SCALE != null && c.NUMERIC_SCALE > 0
              ? `${c.DATA_TYPE}(${c.NUMERIC_PRECISION},${c.NUMERIC_SCALE})`
              : `${c.DATA_TYPE}(${c.NUMERIC_PRECISION})`;
        }
        result[c.TABLE_NAME].columns.push({
          name: c.COLUMN_NAME,
          type,
          nullable: c.IS_NULLABLE === 'YES',
          default: c.COLUMN_DEFAULT,
          comment: c.comment || '',
          is_primary: Boolean(c.is_primary),
          is_auto_increment: Boolean(c.is_identity)
        });
      }
      return result;
    });
  },

  async query(config, sqlText, params = {}) {
    return withMssql(config, async (pool) => {
      const { recordset } = await mssqlQuery(pool, sqlText, params);
      return { rows: recordset, row_count: recordset.length };
    });
  },

  async execute(config, sqlText, params = {}) {
    return withMssql(config, async (pool) => {
      const { rowsAffected } = await mssqlQuery(pool, sqlText, params);
      return {
        affected_rows: rowsAffected[0] || 0
      };
    });
  },

  async executeScript(config, sqlText, params = {}) {
    const statements = splitSqlStatements(sqlText);
    if (statements.length === 0) {
      throw new HttpError(400, 'Empty SQL script');
    }

    return withMssql(config, async (pool) => {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const results: ScriptStatementResult[] = [];
        for (const stmt of statements) {
          const { text, names } = convertNamedParamsToAt(stmt, params);
          const request = new sql.Request(transaction);
          for (const name of names) {
            request.input(name, params[name] as never);
          }
          const result = await request.query(text);
          const rows = (result.recordset || []) as Record<string, unknown>[];
          if (looksLikeQuery(stmt) && Array.isArray(result.recordset)) {
            results.push({
              kind: 'query',
              rows,
              row_count: rows.length
            });
          } else {
            results.push({
              kind: 'execute',
              affected_rows: (result.rowsAffected && result.rowsAffected[0]) || 0
            });
          }
        }
        await transaction.commit();
        return { results };
      } catch (err) {
        await transaction.rollback().catch(() => undefined);
        throw err;
      }
    });
  }
};

/**
 * Adapter registry keyed by DatasourceType.
 * Protocol-compatible types share the base adapter; override per type with
 * `{ ...mysqlAdapter, listTables: customFn }` when metadata quirks appear.
 */
const PROTOCOL_ADAPTERS: Record<DatasourceProtocol, DatasourceAdapter> = {
  mysql: mysqlAdapter,
  postgresql: pgAdapter,
  oracle: oracleAdapter,
  sqlserver: sqlserverAdapter
};

export const adapters: Record<DatasourceType, DatasourceAdapter> =
  Object.fromEntries(
    DATASOURCE_TYPES.map((type) => [
      type,
      PROTOCOL_ADAPTERS[datasourceProtocol(type)]
    ])
  ) as Record<DatasourceType, DatasourceAdapter>;

function adapterFor(config: DatasourceConfig): DatasourceAdapter {
  const adapter = adapters[config.type];
  if (!adapter) {
    throw new HttpError(400, `Unsupported datasource type: ${config.type}`);
  }
  return adapter;
}

/**
 * Test connectivity to a target datasource.
 * Failures return ok:false instead of throwing.
 */
export async function testConnection(config: DatasourceConfig): Promise<TestConnectionResult> {
  return adapterFor(config).testConnection(config);
}

/**
 * List tables in the target database.
 */
export async function listTables(config: DatasourceConfig): Promise<TableInfo[]> {
  return adapterFor(config).listTables(config);
}

/**
 * Describe columns for one or more tables.
 */
export async function describeTables(
  config: DatasourceConfig,
  tables: string[]
): Promise<Record<string, { comment: string; columns: ColumnDefinition[] }>> {
  return adapterFor(config).describeTables(config, tables);
}

/**
 * Execute a SELECT statement with named `:param` placeholders.
 */
export async function query(
  config: DatasourceConfig,
  sql: string,
  params: Record<string, unknown> = {}
): Promise<QueryResult> {
  return adapterFor(config).query(config, sql, params);
}

/**
 * Execute an INSERT / UPDATE / DELETE statement with named `:param` placeholders.
 */
export async function execute(
  config: DatasourceConfig,
  sql: string,
  params: Record<string, unknown> = {}
): Promise<ExecuteResult> {
  return adapterFor(config).execute(config, sql, params);
}

/**
 * Execute a multi-statement SQL script inside a single transaction.
 * Any statement failure rolls back the whole script.
 * Returns per-statement results (query rows or write affected_rows).
 */
export async function executeScript(
  config: DatasourceConfig,
  sql: string,
  params: Record<string, unknown> = {}
): Promise<ScriptResult> {
  return adapterFor(config).executeScript(config, sql, params);
}
