import { HttpError } from '@axiosleo/koapp';
import { Parser } from 'node-sql-parser';
import type {
  DatasourceType,
  HttpMethod,
  ReviewResult,
  SqlParamDef,
  SqlStatus,
  SqlType
} from '../../types';
import { paginationRules, SQL_TYPE_TO_METHOD } from '../../types';
import type { SqlRecord } from '../../services/sqlite';

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

const SUPPORTED_TYPES = new Set<string>(['select', 'insert', 'update', 'delete']);

/** Map a DB record to API response. */
export function toSqlItem(record: SqlRecord): SqlItem {
  let params: SqlParamDef[] = [];
  let review: ReviewResult = { passed: true, issues: [] };
  try {
    params = JSON.parse(record.params_json || '[]') as SqlParamDef[];
  } catch {
    params = [];
  }
  try {
    review = JSON.parse(record.review_json || '{}') as ReviewResult;
    if (typeof review.passed !== 'boolean') {
      review = { passed: true, issues: [] };
    }
    if (!Array.isArray(review.issues)) {
      review.issues = [];
    }
  } catch {
    review = { passed: true, issues: [] };
  }

  return {
    id: record.id,
    connection_id: record.connection_id,
    name: record.name,
    description: record.description,
    sql: record.sql_text,
    sql_type: record.sql_type,
    method: record.method,
    endpoint: `/api/invoke/${record.id}`,
    params,
    status: record.status,
    review,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

/**
 * Replace `:name` placeholders with literal `1` so node-sql-parser can parse.
 * Skips quoted strings and PostgreSQL `::type` casts.
 */
export function replaceNamedParamsForParse(sql: string): string {
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
      result += '1';
      i = j;
      continue;
    }

    result += ch;
    i += 1;
  }

  return result;
}

function fallbackDetectSqlType(sql: string): SqlType {
  // Strip block comments and line comments roughly, then find first keyword.
  let cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  cleaned = cleaned.replace(/--[^\n]*/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Skip leading WITH ... AS (...) CTE preamble for keyword detection
  const withMatch = /^WITH\b/i.exec(cleaned);
  if (withMatch) {
    // Find the main statement keyword after CTE definitions is hard;
    // scan for first SELECT/INSERT/UPDATE/DELETE that isn't inside parens depth tracking simply.
    let depth = 0;
    let i = 0;
    while (i < cleaned.length) {
      const ch = cleaned[i];
      if (ch === '(') {
        depth += 1;
        i += 1;
        continue;
      }
      if (ch === ')') {
        depth = Math.max(0, depth - 1);
        i += 1;
        continue;
      }
      if (depth === 0) {
        const slice = cleaned.slice(i);
        const kw = /^(SELECT|INSERT|UPDATE|DELETE)\b/i.exec(slice);
        if (kw) {
          return kw[1].toLowerCase() as SqlType;
        }
      }
      i += 1;
    }
  }

  const kw = /^(SELECT|INSERT|UPDATE|DELETE)\b/i.exec(cleaned);
  if (kw) {
    return kw[1].toLowerCase() as SqlType;
  }

  throw new HttpError(400, 'Unable to detect SQL type');
}

/**
 * Detect SQL statement type (select/insert/update/delete).
 * Throws HttpError(400) for multi-statement or unsupported types.
 */
export function detectSqlType(sql: string, dialect: DatasourceType = 'mysql'): SqlType {
  const normalized = replaceNamedParamsForParse(sql);
  const database = dialect === 'mysql' ? 'MySQL' : 'PostgresQL';
  const parser = new Parser();

  try {
    const ast = parser.astify(normalized, { database });
    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.length > 1) {
      throw new HttpError(400, 'Only a single SQL statement is allowed');
    }
    if (statements.length === 0 || !statements[0]) {
      throw new HttpError(400, 'Unable to detect SQL type');
    }
    const type = String((statements[0] as { type?: string }).type || '').toLowerCase();
    if (!SUPPORTED_TYPES.has(type)) {
      throw new HttpError(400, `Unsupported SQL type: ${type || 'unknown'}`);
    }
    return type as SqlType;
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    return fallbackDetectSqlType(sql);
  }
}

export function sqlTypeToMethod(sqlType: SqlType): HttpMethod {
  return SQL_TYPE_TO_METHOD[sqlType];
}
