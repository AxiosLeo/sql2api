import type {
  ColumnDefinition,
  DatasourceType,
  TableInfo
} from '../types';

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

/**
 * Test connectivity to a target MySQL / PostgreSQL datasource.
 * Stub: always reports ok.
 */
export async function testConnection(_config: DatasourceConfig): Promise<TestConnectionResult> {
  return {
    ok: true,
    message: 'Stub: connection not actually tested',
    latency_ms: 0
  };
}

/**
 * List tables in the target database.
 * Stub: returns empty list.
 */
export async function listTables(_config: DatasourceConfig): Promise<TableInfo[]> {
  return [];
}

/**
 * Describe columns for one or more tables.
 * Stub: returns empty map.
 */
export async function describeTables(
  _config: DatasourceConfig,
  _tables: string[]
): Promise<Record<string, { comment: string; columns: ColumnDefinition[] }>> {
  return {};
}

/**
 * Execute a SELECT statement with named `:param` placeholders.
 * Stub: returns empty rows.
 */
export async function query(
  _config: DatasourceConfig,
  _sql: string,
  _params: Record<string, unknown>
): Promise<QueryResult> {
  return { rows: [], row_count: 0 };
}

/**
 * Execute an INSERT / UPDATE / DELETE statement with named `:param` placeholders.
 * Stub: returns zero affected rows.
 */
export async function execute(
  _config: DatasourceConfig,
  _sql: string,
  _params: Record<string, unknown>
): Promise<ExecuteResult> {
  return { affected_rows: 0 };
}
