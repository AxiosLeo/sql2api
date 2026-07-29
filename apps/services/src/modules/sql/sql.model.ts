import type {
  HttpMethod,
  ReviewResult,
  SqlParamDef,
  SqlStatus,
  SqlType
} from '../../types';
import { paginationRules } from '../../types';

export interface SqlItem {
  id: string;
  connection_id: string;
  name: string;
  description: string;
  sql: string;
  sql_type: SqlType;
  method: HttpMethod;
  endpoint: string;
  params: SqlParamDef[];
  status: SqlStatus;
  review: ReviewResult;
  created_at: string;
  updated_at: string;
}

export interface CreateSqlBody {
  connection_id: string;
  name: string;
  description?: string;
  sql: string;
  params?: SqlParamDef[];
}

export interface UpdateSqlBody {
  connection_id?: string;
  name?: string;
  description?: string;
  sql?: string;
  params?: SqlParamDef[];
  status?: SqlStatus;
}

export interface GenerateSqlBody {
  connection_id: string;
  prompt: string;
  model_ids?: string[];
}

export interface GenerateResult {
  sql: string;
  sql_type: string;
  method: string;
  params: SqlParamDef[];
  explanation: string;
}

export interface ReviewSqlBody {
  sql: string;
  connection_id?: string;
}

export interface SqlListQuery {
  page?: number;
  size?: number;
  keyword?: string;
  connection_id?: string;
  sql_type?: SqlType;
}

export const createSqlRules = {
  connection_id: 'required|string',
  name: 'required|string|max:64',
  description: 'string',
  sql: 'required|string',
  params: 'array',
  'params.*.name': 'required|string',
  'params.*.rule': 'required|string',
  'params.*.description': 'string'
};

export const updateSqlRules = {
  connection_id: 'string',
  name: 'string|max:64',
  description: 'string',
  sql: 'string',
  params: 'array',
  'params.*.name': 'required|string',
  'params.*.rule': 'required|string',
  'params.*.description': 'string',
  status: 'in:enabled,disabled'
};

export const generateSqlRules = {
  connection_id: 'required|string',
  prompt: 'required|string',
  model_ids: 'array',
  'model_ids.*': 'string'
};

export const reviewSqlRules = {
  sql: 'required|string',
  connection_id: 'string'
};

export const sqlIdRules = {
  id: 'required|string'
};

export const sqlListQueryRules = {
  ...paginationRules,
  connection_id: 'string',
  sql_type: 'in:select,insert,update,delete'
};

export function stubSql(overrides: Partial<SqlItem> = {}): SqlItem {
  const now = new Date().toISOString();
  const id = overrides.id || 'stub-sql-uuid';
  return {
    id,
    connection_id: 'stub-connection-id',
    name: 'stub-sql',
    description: '',
    sql: 'SELECT * FROM users WHERE id = :id',
    sql_type: 'select',
    method: 'GET',
    endpoint: `/api/invoke/${id}`,
    params: [
      { name: 'id', rule: 'required|integer', description: 'User id' }
    ],
    status: 'enabled',
    review: { passed: true, issues: [] },
    created_at: now,
    updated_at: now,
    ...overrides
  };
}
