import { HttpError } from '@axiosleo/koapp';
import { Parser } from 'node-sql-parser';
import type {
  DatasourceType,
  HttpMethod,
  ReviewIssue,
  ReviewResult,
  SqlParamDef,
  SqlStatus,
  SqlType
} from '../../types';
import { paginationRules, SQL_TYPE_TO_METHOD } from '../../types';
import type { SqlRecord } from '../../services/sqlite';
import {
  hasForbiddenKeywordOutsideQuotes,
  splitSqlStatements
} from '../../services/sql-text';

export interface SqlItem {
  id: string;
  app_id: string;
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
  selected_tables?: string[];
  steps?: Array<{
    stage: string;
    message: string;
    tables?: string[];
  }>;
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
  sql_type: 'in:select,insert,update,complex',
  app_id: 'string'
};

/** Simple DML types that map 1:1 to HTTP methods when used as a single statement. */
const SIMPLE_TYPES = new Set<string>(['select', 'insert', 'update']);

const FORBIDDEN_KEYWORDS = ['DELETE', 'DROP', 'TRUNCATE'];

export type StatementKind =
  | 'select'
  | 'insert'
  | 'update'
  | 'delete'
  | 'drop'
  | 'truncate'
  | 'alter'
  | 'call'
  | 'function'
  | 'procedure'
  | 'do'
  | 'execute'
  | 'exec'
  | 'unknown';

export interface StatementAnalysis {
  sql: string;
  kind: StatementKind;
}

export interface SqlAnalysis {
  statements: StatementAnalysis[];
  sql_type: SqlType;
  method: HttpMethod;
}

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
    app_id: record.app_id,
    connection_id: record.connection_id,
    name: record.name,
    description: record.description,
    sql: record.sql_text,
    sql_type: record.sql_type,
    method: record.method,
    endpoint: `/openapi/invoke/${record.id}`,
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

function fallbackDetectStatementKind(sql: string): StatementKind {
  // Strip block comments and line comments roughly, then find first keyword.
  let cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  cleaned = cleaned.replace(/--[^\n]*/g, ' ');
  cleaned = cleaned.replace(/#[^\n]*/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Skip leading WITH ... AS (...) CTE preamble for keyword detection
  const withMatch = /^WITH\b/i.exec(cleaned);
  if (withMatch) {
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
        const kw =
          /^(SELECT|INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CALL|DO|EXECUTE|EXEC)\b/i.exec(
            slice
          );
        if (kw) {
          return kw[1].toLowerCase() as StatementKind;
        }
      }
      i += 1;
    }
  }

  const kw =
    /^(SELECT|INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CALL|DO|EXECUTE|EXEC)\b/i.exec(
      cleaned
    );
  if (kw) {
    return kw[1].toLowerCase() as StatementKind;
  }

  return 'unknown';
}

/**
 * Detect the kind of a single SQL statement (select/insert/update/delete/call/...).
 */
export function detectStatementKind(
  sql: string,
  dialect: DatasourceType = 'mysql'
): StatementKind {
  const normalized = replaceNamedParamsForParse(sql);
  const database = dialect === 'mysql' ? 'MySQL' : 'PostgresQL';
  const parser = new Parser();

  try {
    const ast = parser.astify(normalized, { database });
    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.length > 1) {
      // Nested multi-statement inside what we thought was one statement —
      // treat as unknown so analyzeSql can promote to complex via split.
      return 'unknown';
    }
    if (statements.length === 0 || !statements[0]) {
      return fallbackDetectStatementKind(sql);
    }
    const type = String(
      (statements[0] as { type?: string }).type || ''
    ).toLowerCase();
    if (!type) {
      return fallbackDetectStatementKind(sql);
    }
    return type as StatementKind;
  } catch {
    return fallbackDetectStatementKind(sql);
  }
}

/**
 * Analyze a SQL script: split statements, classify each, and determine
 * the overall sql_type + HTTP method.
 *
 * Rules:
 * - Single select/insert/update → that type + mapped method
 * - Multiple statements (any mix) → complex / POST
 * - Single CALL / function / procedure / DO / EXECUTE → complex / POST
 * - Single DROP/DELETE/TRUNCATE → complex for typing; blocked by staticAuditSql
 */
export function analyzeSql(
  sql: string,
  dialect: DatasourceType = 'mysql'
): SqlAnalysis {
  const parts = splitSqlStatements(sql);
  if (parts.length === 0) {
    throw new HttpError(400, 'Unable to detect SQL type');
  }

  const statements: StatementAnalysis[] = parts.map((part) => ({
    sql: part,
    kind: detectStatementKind(part, dialect)
  }));

  if (statements.length > 1) {
    return {
      statements,
      sql_type: 'complex',
      method: 'POST'
    };
  }

  const kind = statements[0].kind;

  if (SIMPLE_TYPES.has(kind)) {
    const sqlType = kind as SqlType;
    return {
      statements,
      sql_type: sqlType,
      method: SQL_TYPE_TO_METHOD[sqlType]
    };
  }

  // CALL / DROP / DELETE / unknown single statements → complex (POST).
  // Forbidden ones are still blocked by staticAuditSql.
  return {
    statements,
    sql_type: 'complex',
    method: 'POST'
  };
}

/**
 * Static hard-block audit: DROP / DELETE / TRUNCATE are never allowed.
 * Also rejects ALTER as destructive DDL. Uses parser kinds when available,
 * and a quote-aware keyword scan as fallback.
 */
export function staticAuditSql(analysis: SqlAnalysis): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  for (let idx = 0; idx < analysis.statements.length; idx += 1) {
    const stmt = analysis.statements[idx];
    const label =
      analysis.statements.length > 1
        ? `Statement ${idx + 1}`
        : 'SQL statement';

    if (stmt.kind === 'delete') {
      issues.push({
        severity: 'error',
        message: `${label}: DELETE operations are not allowed`,
        suggestion: 'Remove DELETE statements. Use UPDATE or soft-delete patterns instead.'
      });
      continue;
    }
    if (stmt.kind === 'drop') {
      issues.push({
        severity: 'error',
        message: `${label}: DROP operations are not allowed`,
        suggestion: 'Remove DROP statements from SQL APIs.'
      });
      continue;
    }
    if (stmt.kind === 'truncate') {
      issues.push({
        severity: 'error',
        message: `${label}: TRUNCATE operations are not allowed`,
        suggestion: 'Remove TRUNCATE statements from SQL APIs.'
      });
      continue;
    }

    // Fallback keyword scan when parser returned unknown
    if (
      stmt.kind === 'unknown'
      && hasForbiddenKeywordOutsideQuotes(stmt.sql, FORBIDDEN_KEYWORDS)
    ) {
      issues.push({
        severity: 'error',
        message: `${label}: contains forbidden keyword (DELETE / DROP / TRUNCATE)`,
        suggestion: 'Remove destructive operations from SQL APIs.'
      });
    }
  }

  return issues;
}

/**
 * Detect SQL statement type (select/insert/update/complex).
 * Prefer analyzeSql for new code paths; this remains for callers that only
 * need the type.
 */
export function detectSqlType(sql: string, dialect: DatasourceType = 'mysql'): SqlType {
  return analyzeSql(sql, dialect).sql_type;
}

export function sqlTypeToMethod(sqlType: SqlType): HttpMethod {
  return SQL_TYPE_TO_METHOD[sqlType];
}

/** Merge static + AI review issues; passed=false if any error-severity issue. */
export function mergeReviewResults(
  staticIssues: ReviewIssue[],
  aiReview: ReviewResult
): ReviewResult {
  const issues = [...staticIssues, ...(aiReview.issues || [])];
  const hasError = issues.some((i) => i.severity === 'error');
  return {
    passed: !hasError && Boolean(aiReview.passed),
    issues
  };
}
