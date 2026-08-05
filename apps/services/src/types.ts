/** Wire protocol / Node driver family. */
export type DatasourceProtocol =
  | 'mysql'
  | 'postgresql'
  | 'oracle'
  | 'sqlserver';

/**
 * All supported customer datasource types.
 * Protocol-compatible variants reuse mysql2 / pg; Oracle and SQL Server use
 * dedicated drivers. Each keeps an independent type so dialect prompts and
 * adapter overrides can differ per engine.
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
  'kingbase',
  'oracle',
  'sqlserver'
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
  kingbase: 'postgresql',
  oracle: 'oracle',
  sqlserver: 'sqlserver'
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
  kingbase: 'KingbaseES (PostgreSQL compatible)',
  oracle: 'Oracle',
  sqlserver: 'SQL Server'
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

/** All Meta2API field types (13). System built-ins are also types. */
export const META_FIELD_TYPES = [
  'text',
  'number',
  'single_select',
  'multi_select',
  'datetime',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
  'one_way_link',
  'two_way_link',
  'parent_record',
  'attachment'
] as const;

export type MetaFieldType = (typeof META_FIELD_TYPES)[number];

/** Field types that users can create manually (excludes system built-ins). */
export const META_USER_FIELD_TYPES = [
  'text',
  'number',
  'single_select',
  'multi_select',
  'datetime',
  'one_way_link',
  'two_way_link',
  'parent_record',
  'attachment'
] as const;

export type MetaUserFieldType = (typeof META_USER_FIELD_TYPES)[number];

export const META_SYSTEM_FIELD_TYPES = [
  'created_by',
  'updated_by',
  'created_at',
  'updated_at'
] as const;

export type MetaSystemFieldType = (typeof META_SYSTEM_FIELD_TYPES)[number];

/** validatorjs `in:` rule fragment for meta field type. */
export const META_FIELD_TYPE_IN_RULE = META_FIELD_TYPES.join(',');

/** validatorjs `in:` for user-creatable field types. */
export const META_USER_FIELD_TYPE_IN_RULE = META_USER_FIELD_TYPES.join(',');

export type MetaTableStatus = 'active' | 'disabled';

export type MetaShardStatus = 'active' | 'sealed';

/** Default capacity (record count) for a cell shard table. */
export const META_SHARD_DEFAULT_CAPACITY = 100_000;

export type MetaLinkFilterOp = 'eq' | 'neq' | 'in' | 'contains';

export const META_LINK_FILTER_OPS = [
  'eq',
  'neq',
  'in',
  'contains'
] as const;

export interface MetaLinkFilter {
  /** Target table meta_fields.id */
  field_id: string;
  op: MetaLinkFilterOp;
  /** eq/neq/contains: scalar; in: non-empty array */
  value: unknown;
}

export interface MetaFieldConfig {
  options?: string[];
  format?: string;
  target_table_id?: string;
  reverse_field_id?: string;
  /** Allow multiple values for link/attachment. Default true. */
  multiple?: boolean;
  /** Link association scope. Default 'all'. */
  link_scope?: 'all' | 'filter';
  /** AND filters when link_scope === 'filter'. */
  filters?: MetaLinkFilter[];
}
