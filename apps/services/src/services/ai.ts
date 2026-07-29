import type {
  ColumnDefinition,
  DatasourceType,
  ReviewResult,
  SqlParamDef
} from '../types';

export interface AIGenerateResult {
  sql: string;
  sql_type: string;
  method: string;
  params: SqlParamDef[];
  explanation: string;
}

export interface ModelContext {
  table_name: string;
  comment: string;
  columns: ColumnDefinition[];
}

export interface ReviewSQLInput {
  sql: string;
  connection_id?: string;
  dialect?: DatasourceType;
  models?: ModelContext[];
}

export interface GenerateSQLInput {
  prompt: string;
  connection_id: string;
  dialect?: DatasourceType;
  models?: ModelContext[];
}

/**
 * Review a SQL statement via node-llama-cpp.
 * Stub: always returns passed=true. Real inference lands in a later iteration.
 */
export async function reviewSQL(_input: ReviewSQLInput): Promise<ReviewResult> {
  return {
    passed: true,
    issues: []
  };
}

/**
 * Generate SQL + param config from natural language via node-llama-cpp.
 * Stub: returns a placeholder SELECT. Real inference lands in a later iteration.
 */
export async function generateSQL(input: GenerateSQLInput): Promise<AIGenerateResult> {
  return {
    sql: 'SELECT 1 AS stub',
    sql_type: 'select',
    method: 'GET',
    params: [],
    explanation: `Stub generation for prompt: ${input.prompt}`
  };
}
