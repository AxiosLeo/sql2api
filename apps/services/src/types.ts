/** Wire protocol used by the Node driver (mysql2 or pg). */
export type DatasourceProtocol = 'mysql' | 'postgresql';

/**
 * All supported customer datasource types.
 * Protocol-compatible variants reuse mysql2 / pg; each keeps an independent type
 * so dialect prompts and future adapter overrides can differ per engine.
 */
export const DATASOURCE_TYPES = [
  'mysql',
  'mariadb',
  'tidb',
  'oceanbase',
  'doris',
  'starrocks',
  'postgresql',
  'cockroachdb',
  'yugabytedb',
  'opengauss',
  'kingbase'
] as const;

export type DatasourceType = (typeof DATASOURCE_TYPES)[number];

/** Map each datasource type to the wire protocol / Node driver family. */
export const DATASOURCE_PROTOCOLS: Record<DatasourceType, DatasourceProtocol> = {
  mysql: 'mysql',
  mariadb: 'mysql',
  tidb: 'mysql',
  oceanbase: 'mysql',
  doris: 'mysql',
  starrocks: 'mysql',
  postgresql: 'postgresql',
  cockroachdb: 'postgresql',
  yugabytedb: 'postgresql',
  opengauss: 'postgresql',
  kingbase: 'postgresql'
};

export function datasourceProtocol(type: DatasourceType): DatasourceProtocol {
  return DATASOURCE_PROTOCOLS[type];
}

/** Human-readable labels for AI prompts and UI-facing messages. */
export const DATASOURCE_LABELS: Record<DatasourceType, string> = {
  mysql: 'MySQL',
  mariadb: 'MariaDB (MySQL compatible)',
  tidb: 'TiDB (MySQL compatible)',
  oceanbase: 'OceanBase (MySQL compatible)',
  doris: 'Apache Doris (MySQL compatible)',
  starrocks: 'StarRocks (MySQL compatible)',
  postgresql: 'PostgreSQL',
  cockroachdb: 'CockroachDB (PostgreSQL compatible)',
  yugabytedb: 'YugabyteDB (PostgreSQL compatible)',
  opengauss: 'openGauss (PostgreSQL compatible)',
  kingbase: 'KingbaseES (PostgreSQL compatible)'
};

/** validatorjs `in:` rule fragment for connection type fields. */
export const DATASOURCE_TYPE_IN_RULE = DATASOURCE_TYPES.join(',');

export type SqlType = 'select' | 'insert' | 'update' | 'complex';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type EntityStatus = 'active' | 'disabled';

export type SqlStatus = 'enabled' | 'disabled' | 'draft';

export interface PaginationQuery {
  page?: number;
  size?: number;
  keyword?: string;
}

export interface PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
}

export interface ReviewIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

export interface ReviewResult {
  passed: boolean;
  issues: ReviewIssue[];
}

export interface SqlParamDef {
  name: string;
  rule: string;
  description?: string;
  default?: unknown;
}

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  comment: string;
  is_primary: boolean;
  is_auto_increment: boolean;
}

export interface TableInfo {
  name: string;
  comment: string;
}

export const paginationRules = {
  page: 'integer|min:1',
  size: 'integer|min:1|max:100',
  keyword: 'string'
};

export const SQL_TYPE_TO_METHOD: Record<SqlType, HttpMethod> = {
  select: 'GET',
  insert: 'POST',
  update: 'PATCH',
  complex: 'POST'
};
