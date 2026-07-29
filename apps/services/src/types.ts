export type DatasourceType = 'mysql' | 'postgresql';

export type SqlType = 'select' | 'insert' | 'update' | 'delete';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type EntityStatus = 'active' | 'disabled';

export type SqlStatus = 'enabled' | 'disabled';

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
  delete: 'DELETE'
};
