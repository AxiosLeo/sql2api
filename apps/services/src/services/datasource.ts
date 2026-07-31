import mysql from 'mysql2/promise';
import { Client as PgClient } from 'pg';
import { HttpError } from '@axiosleo/koapp';
import type {
  ColumnDefinition,
  DatasourceType,
  TableInfo
} from '../types';
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

/**
 * Test connectivity to a target MySQL / PostgreSQL datasource.
 * Failures return ok:false instead of throwing.
 */
export async function testConnection(config: DatasourceConfig): Promise<TestConnectionResult> {
  const started = Date.now();
  try {
    if (config.type === 'mysql') {
      await withMysql(config, async (conn) => {
        await conn.query('SELECT 1');
      });
    } else {
      await withPg(config, async (client) => {
        await client.query('SELECT 1');
      });
    }
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

/**
 * List tables in the target database.
 */
export async function listTables(config: DatasourceConfig): Promise<TableInfo[]> {
  if (config.type === 'mysql') {
    return listTablesMysql(config);
  }
  return listTablesPg(config);
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

/**
 * Describe columns for one or more tables.
 */
export async function describeTables(
  config: DatasourceConfig,
  tables: string[]
): Promise<Record<string, { comment: string; columns: ColumnDefinition[] }>> {
  if (config.type === 'mysql') {
    return describeTablesMysql(config, tables);
  }
  return describeTablesPg(config, tables);
}

/**
 * Execute a SELECT statement with named `:param` placeholders.
 */
export async function query(
  config: DatasourceConfig,
  sql: string,
  params: Record<string, unknown> = {}
): Promise<QueryResult> {
  if (config.type === 'mysql') {
    return withMysql(config, async (conn) => {
      // namedPlaceholders: true — values is a name→value map
      const [rows] = await conn.query(sql, params as never);
      const list = rows as Record<string, unknown>[];
      return { rows: list, row_count: list.length };
    });
  }

  const { text, values } = convertNamedParams(sql, params);
  return withPg(config, async (client) => {
    const result = await client.query(text, values);
    return {
      rows: result.rows as Record<string, unknown>[],
      row_count: result.rowCount ?? result.rows.length
    };
  });
}

/**
 * Execute an INSERT / UPDATE / DELETE statement with named `:param` placeholders.
 */
export async function execute(
  config: DatasourceConfig,
  sql: string,
  params: Record<string, unknown> = {}
): Promise<ExecuteResult> {
  if (config.type === 'mysql') {
    return withMysql(config, async (conn) => {
      const [result] = await conn.execute(sql, params as never);
      const header = result as mysql.ResultSetHeader;
      return {
        affected_rows: header.affectedRows || 0,
        insert_id: header.insertId || undefined
      };
    });
  }

  const { text, values } = convertNamedParams(sql, params);
  return withPg(config, async (client) => {
    const result = await client.query(text, values);
    return {
      affected_rows: result.rowCount ?? 0
    };
  });
}

export type ScriptStatementResult =
  | { kind: 'query'; rows: Record<string, unknown>[]; row_count: number }
  | { kind: 'execute'; affected_rows: number; insert_id?: number };

export interface ScriptResult {
  results: ScriptStatementResult[];
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
  const statements = splitSqlStatements(sql);
  if (statements.length === 0) {
    throw new HttpError(400, 'Empty SQL script');
  }

  if (config.type === 'mysql') {
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
