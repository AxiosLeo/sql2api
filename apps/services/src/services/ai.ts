import fs from 'fs';
import path from 'path';
import { HttpError } from '@axiosleo/koapp';
import config from '../config';
import type {
  ColumnDefinition,
  DatasourceType,
  ReviewResult,
  SqlParamDef,
  SqlType
} from '../types';
import { SQL_TYPE_TO_METHOD } from '../types';
import { analyzeSql, staticAuditSql } from '../modules/sql/sql.model';
import { reconcileSqlParams, slugifyApiName } from './sql-text';

export interface AIGenerateResult {
  sql: string;
  sql_type: string;
  method: string;
  params: SqlParamDef[];
  explanation: string;
  suggested_name: string;
}

export type PipelineStage = 'plan' | 'generate' | 'params' | 'repair';

export interface PipelineStepSummary {
  stage: PipelineStage;
  message: string;
  tables?: string[];
}

export interface AIGeneratePipelineResult extends AIGenerateResult {
  selected_tables: string[];
  steps: PipelineStepSummary[];
}

export interface GenerateProgressEvent {
  stage: PipelineStage;
  status: 'start' | 'done';
  tables?: string[];
  planned_steps?: string[];
  message?: string;
}

export type GenerateProgressCallback = (
  event: GenerateProgressEvent
) => void | Promise<void>;

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
  /** When true, skip the AI table-selection plan step (user already picked tables). */
  preselected?: boolean;
}

export type PlanStep = 'generate_sql' | 'review_fix';

export interface PlanGenerationResult {
  tables: string[];
  steps: PlanStep[];
  reason: string;
}

type NlcModule = typeof import('node-llama-cpp');

interface LoadedModel {
  llama: Awaited<ReturnType<NlcModule['getLlama']>>;
  model: Awaited<ReturnType<Awaited<ReturnType<NlcModule['getLlama']>>['loadModel']>>;
  modelPath: string;
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: {
            type: 'string',
            enum: ['error', 'warning', 'info']
          },
          message: { type: 'string' },
          suggestion: { type: 'string' }
        },
        required: ['severity', 'message']
      }
    }
  },
  required: ['passed', 'issues']
} as const;

const GENERATE_SCHEMA = {
  type: 'object',
  properties: {
    sql: { type: 'string' },
    sql_type: {
      type: 'string',
      enum: ['select', 'insert', 'update', 'complex']
    },
    params: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          rule: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['name', 'rule']
      }
    },
    explanation: { type: 'string' },
    name: { type: 'string' }
  },
  required: ['sql', 'sql_type', 'params', 'explanation', 'name']
} as const;

const NAME_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' }
  },
  required: ['name']
} as const;

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    tables: {
      type: 'array',
      items: { type: 'string' }
    },
    steps: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['generate_sql', 'review_fix']
      }
    },
    reason: { type: 'string' }
  },
  required: ['tables', 'steps', 'reason']
} as const;

const PLAN_SKIP_THRESHOLD = 3;

let nlcModule: NlcModule | null = null;
let loaded: LoadedModel | null = null;
let loadPromise: Promise<LoadedModel | null> | null = null;
let inferenceChain: Promise<unknown> = Promise.resolve();

function resolveModelPath(): string {
  const raw = process.env.LLAMA_MODEL_PATH || config.envs.ai.model_path || '';
  if (!raw) {
    return '';
  }
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

async function importNlc(): Promise<NlcModule> {
  if (nlcModule) {
    return nlcModule;
  }
  // node-llama-cpp is ESM-only; dynamic import via Function avoids TS CJS emit issues
  const importer = new Function('specifier', 'return import(specifier)') as (
    specifier: string
  ) => Promise<NlcModule>;
  nlcModule = await importer('node-llama-cpp');
  return nlcModule;
}

async function ensureModel(): Promise<LoadedModel | null> {
  const modelPath = resolveModelPath();
  if (!modelPath) {
    return null;
  }
  if (!fs.existsSync(modelPath)) {
    throw new HttpError(503, `AI Service Unavailable: model file not found at ${modelPath}`);
  }
  if (loaded && loaded.modelPath === modelPath) {
    return loaded;
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      const nlc = await importNlc();
      const llama = await nlc.getLlama();
      const model = await llama.loadModel({ modelPath });
      loaded = { llama, model, modelPath };
      return loaded;
    } catch (err) {
      loaded = null;
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof HttpError) {
        throw err;
      }
      throw new HttpError(503, `AI Service Unavailable: ${message}`);
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

function formatModelsContext(models?: ModelContext[]): string {
  if (!models || models.length === 0) {
    return '(no table models provided)';
  }
  return models.map((m) => {
    const cols = m.columns.map((c) => {
      const flags = [
        c.is_primary ? 'PK' : '',
        c.is_auto_increment ? 'AI' : '',
        c.nullable ? 'NULL' : 'NOT NULL'
      ].filter(Boolean).join(', ');
      return `  - ${c.name} ${c.type} (${flags})${c.comment ? ` // ${c.comment}` : ''}`;
    }).join('\n');
    return `Table ${m.table_name}${m.comment ? ` (${m.comment})` : ''}:\n${cols}`;
  }).join('\n\n');
}

/** Compact catalog: table name + comment only (for the plan/select step). */
function formatCatalogContext(models?: ModelContext[]): string {
  if (!models || models.length === 0) {
    return '(no tables available)';
  }
  return models
    .map((m) => `- ${m.table_name}${m.comment ? ` — ${m.comment}` : ''}`)
    .join('\n');
}

interface RunGrammarOptions {
  maxTokens?: number;
}

async function runWithGrammar<T>(
  systemPrompt: string,
  userPrompt: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any,
  options?: RunGrammarOptions
): Promise<T> {
  const maxTokens = options?.maxTokens ?? 1024;
  const run = async (): Promise<T> => {
    const state = await ensureModel();
    if (!state) {
      throw new HttpError(503, 'AI Service Unavailable: LLAMA_MODEL_PATH not configured');
    }

    const context = await state.model.createContext();
    try {
      const nlc = await importNlc();
      const { LlamaChatSession } = nlc;
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt
      });
      const grammar = await state.llama.createGrammarForJsonSchema(schema);
      const response = await session.prompt(userPrompt, {
        grammar,
        maxTokens,
        temperature: 0.1
      });
      return grammar.parse(response) as T;
    } finally {
      await context.dispose();
    }
  };

  const next = inferenceChain.then(run, run);
  inferenceChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function normalizeSqlType(raw: string): SqlType {
  return (['select', 'insert', 'update', 'complex'].includes(raw)
    ? raw
    : 'select') as SqlType;
}

function toGenerateResult(result: {
  sql: string;
  sql_type: string;
  params: SqlParamDef[];
  explanation: string;
  name?: string;
}): AIGenerateResult {
  const sqlType = normalizeSqlType(result.sql_type);
  return {
    sql: result.sql,
    sql_type: sqlType,
    method: SQL_TYPE_TO_METHOD[sqlType],
    params: Array.isArray(result.params) ? result.params : [],
    explanation: result.explanation || '',
    suggested_name: slugifyApiName(result.name || '')
  };
}

/**
 * Review a SQL statement via node-llama-cpp.
 * When LLAMA_MODEL_PATH is unset, gracefully degrades (passed=true + info issue).
 */
export async function reviewSQL(input: ReviewSQLInput): Promise<ReviewResult> {
  const modelPath = resolveModelPath();
  if (!modelPath) {
    return {
      passed: true,
      issues: [{
        severity: 'info',
        message: 'AI review skipped: LLAMA_MODEL_PATH not configured'
      }]
    };
  }

  try {
    const dialect = input.dialect || 'mysql';
    const systemPrompt = [
      'You are a senior SQL security and quality reviewer.',
      'Review the given SQL for safety, correctness, and best practices.',
      'Return ONLY JSON matching the schema.',
      'HARD RULES (always severity=error and passed=false):',
      '- DELETE statements are forbidden.',
      '- DROP statements are forbidden.',
      '- TRUNCATE statements are forbidden.',
      'Also flag as error: clear SQL injection risks, destructive ops without WHERE, and syntax errors for the given dialect.',
      'Performance checks (warning unless severe): SELECT *, missing LIMIT on large tables, UPDATE without WHERE,',
      'non-sargable predicates (functions on indexed columns), missing index opportunities given the schema context.',
      'When the script has multiple statements, review each statement.',
      'Warnings/info alone may still allow passed=true; any severity=error must set passed=false.'
    ].join(' ');

    const userPrompt = [
      `Dialect: ${dialect}`,
      'Schema context:',
      formatModelsContext(input.models),
      '',
      'SQL to review:',
      input.sql
    ].join('\n');

    const result = await runWithGrammar<ReviewResult>(systemPrompt, userPrompt, REVIEW_SCHEMA);
    return {
      passed: Boolean(result.passed),
      issues: Array.isArray(result.issues) ? result.issues : []
    };
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(503, `AI Service Unavailable: ${message}`);
  }
}

function buildGenerateSystemPrompt(dialect: DatasourceType): string {
  return [
    'You are a senior SQL engineer.',
    `Generate a single ${dialect} SQL statement from the user request.`,
    'Use named placeholders like :param_name (not ? or $1).',
    'Variable values from the user request (year, month, id, name, dates, etc.) MUST use :name placeholders — NEVER hardcode literals.',
    'Include validatorjs-style rules for each param (e.g. required|integer).',
    'params MUST cover every :name placeholder in the SQL.',
    'Prefer the most specific matching table from schema context (e.g. a statistics table over raw detail tables when the request asks for 统计/summary).',
    'NEVER generate DELETE, DROP, or TRUNCATE statements.',
    'Prefer SELECT / INSERT / UPDATE. For multi-step logic use sql_type=complex.',
    'Also provide name: a short kebab-case API name in lowercase english words joined by hyphens (e.g. get-user-by-id).',
    'Return ONLY JSON matching the schema.'
  ].join(' ');
}

/**
 * Plan which tables to use and which generation steps to run.
 * Uses a compact catalog (names + comments only) to keep inference fast.
 */
export async function planGeneration(input: {
  prompt: string;
  dialect?: DatasourceType;
  models: ModelContext[];
}): Promise<PlanGenerationResult> {
  const dialect = input.dialect || 'mysql';
  const known = new Set(input.models.map((m) => m.table_name));

  const systemPrompt = [
    'You are a senior SQL engineer planning a SQL generation task.',
    'Given a user request and a catalog of available tables (name + comment),',
    'select the minimal set of relevant tables and the steps to generate correct SQL.',
    'steps must include generate_sql; add review_fix only if the request looks ambiguous or risky.',
    'Prefer summary/statistics tables when the request asks for 统计/汇总/aggregate metrics.',
    'Return ONLY JSON matching the schema. table names MUST exactly match the catalog.'
  ].join(' ');

  const userPrompt = [
    `Dialect: ${dialect}`,
    'Available tables:',
    formatCatalogContext(input.models),
    '',
    'User request:',
    input.prompt
  ].join('\n');

  const raw = await runWithGrammar<{
    tables: string[];
    steps: string[];
    reason: string;
  }>(systemPrompt, userPrompt, PLAN_SCHEMA, { maxTokens: 256 });

  const tables = (Array.isArray(raw.tables) ? raw.tables : [])
    .filter((t) => typeof t === 'string' && known.has(t));
  const stepsRaw = Array.isArray(raw.steps) ? raw.steps : [];
  const steps: PlanStep[] = [];
  for (const s of stepsRaw) {
    if (s === 'generate_sql' || s === 'review_fix') {
      if (!steps.includes(s)) {
        steps.push(s);
      }
    }
  }
  if (!steps.includes('generate_sql')) {
    steps.unshift('generate_sql');
  }

  return {
    tables: tables.length > 0 ? tables : input.models.map((m) => m.table_name),
    steps,
    reason: raw.reason || ''
  };
}

/**
 * Generate SQL + param config from natural language via node-llama-cpp.
 * Requires LLAMA_MODEL_PATH; throws 503 when unset.
 */
export async function generateSQL(input: GenerateSQLInput): Promise<AIGenerateResult> {
  const modelPath = resolveModelPath();
  if (!modelPath) {
    throw new HttpError(503, 'AI Service Unavailable: LLAMA_MODEL_PATH not configured');
  }

  try {
    const dialect = input.dialect || 'mysql';
    const userPrompt = [
      `Dialect: ${dialect}`,
      'Schema context:',
      formatModelsContext(input.models),
      '',
      'User request:',
      input.prompt
    ].join('\n');

    const result = await runWithGrammar<{
      sql: string;
      sql_type: SqlType;
      params: SqlParamDef[];
      explanation: string;
      name?: string;
    }>(buildGenerateSystemPrompt(dialect), userPrompt, GENERATE_SCHEMA);

    return toGenerateResult(result);
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(503, `AI Service Unavailable: ${message}`);
  }
}

async function repairSQL(input: {
  prompt: string;
  dialect: DatasourceType;
  models: ModelContext[];
  sql: string;
  issues: string[];
}): Promise<AIGenerateResult> {
  const systemPrompt = [
    buildGenerateSystemPrompt(input.dialect),
    'Fix the previous SQL according to the listed issues. Keep named placeholders.'
  ].join(' ');

  const userPrompt = [
    `Dialect: ${input.dialect}`,
    'Schema context:',
    formatModelsContext(input.models),
    '',
    'User request:',
    input.prompt,
    '',
    'Previous SQL:',
    input.sql,
    '',
    'Issues to fix:',
    input.issues.map((i) => `- ${i}`).join('\n')
  ].join('\n');

  const result = await runWithGrammar<{
    sql: string;
    sql_type: SqlType;
    params: SqlParamDef[];
    explanation: string;
    name?: string;
  }>(systemPrompt, userPrompt, GENERATE_SCHEMA);

  return toGenerateResult(result);
}

/**
 * Suggest a kebab-case API name from prompt / SQL / param names.
 */
export async function generateApiName(input: {
  prompt?: string;
  sql?: string;
  params?: string[];
}): Promise<string> {
  const modelPath = resolveModelPath();
  if (!modelPath) {
    throw new HttpError(503, 'AI Service Unavailable: LLAMA_MODEL_PATH not configured');
  }

  const prompt = (input.prompt || '').trim();
  const sql = (input.sql || '').trim();
  const params = (input.params || []).filter((p) => typeof p === 'string' && p.trim());

  if (!prompt && !sql) {
    throw new HttpError(400, 'Either prompt or sql is required');
  }

  try {
    const systemPrompt = [
      'You name HTTP API endpoints.',
      'Return a short kebab-case name: lowercase english words joined by hyphens (e.g. get-user-by-id).',
      'Prefer verb + resource style based on the SQL intent (get/list/create/update-...).',
      'Do not include spaces, underscores, or punctuation other than hyphens.',
      'Keep it under 64 characters. Return ONLY JSON matching the schema.'
    ].join(' ');

    const parts: string[] = [];
    if (prompt) {
      parts.push('User request / prompt:', prompt, '');
    }
    if (sql) {
      parts.push('SQL:', sql, '');
    }
    if (params.length > 0) {
      parts.push('Parameter names:', params.join(', '));
    }

    const raw = await runWithGrammar<{ name: string }>(
      systemPrompt,
      parts.join('\n'),
      NAME_SCHEMA,
      { maxTokens: 64 }
    );
    const name = slugifyApiName(raw.name || '');
    if (!name) {
      throw new HttpError(422, 'AI did not produce a usable name');
    }
    return name;
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(503, `AI Service Unavailable: ${message}`);
  }
}

/**
 * Multi-step SQL generation pipeline:
 * 1) (optional) plan + select tables from compact catalog
 * 2) generate SQL with full column context for selected tables only
 * 3) reconcile params with :name placeholders
 * 4) optional one-shot repair when static audit fails or plan requested review_fix
 */
export async function generateSQLPipeline(
  input: GenerateSQLInput,
  onProgress?: GenerateProgressCallback
): Promise<AIGeneratePipelineResult> {
  const modelPath = resolveModelPath();
  if (!modelPath) {
    throw new HttpError(503, 'AI Service Unavailable: LLAMA_MODEL_PATH not configured');
  }

  const dialect = input.dialect || 'mysql';
  const allModels = input.models || [];
  const steps: PipelineStepSummary[] = [];
  const emit = async (event: GenerateProgressEvent) => {
    if (onProgress) {
      await onProgress(event);
    }
  };

  try {
    let selectedModels = allModels;
    let plannedSteps: PlanStep[] = ['generate_sql'];
    const skipPlan =
      Boolean(input.preselected)
      || allModels.length <= PLAN_SKIP_THRESHOLD;

    if (!skipPlan && allModels.length > 0) {
      await emit({
        stage: 'plan',
        status: 'start',
        message: 'Planning tables and steps...'
      });
      const plan = await planGeneration({
        prompt: input.prompt,
        dialect,
        models: allModels
      });
      plannedSteps = plan.steps;
      const selectedNames = new Set(plan.tables);
      selectedModels = allModels.filter((m) => selectedNames.has(m.table_name));
      if (selectedModels.length === 0) {
        selectedModels = allModels;
      }
      const tableNames = selectedModels.map((m) => m.table_name);
      steps.push({
        stage: 'plan',
        message: plan.reason || `Selected ${tableNames.length} table(s)`,
        tables: tableNames
      });
      await emit({
        stage: 'plan',
        status: 'done',
        tables: tableNames,
        planned_steps: plannedSteps,
        message: plan.reason || `Selected tables: ${tableNames.join(', ')}`
      });
    } else {
      const tableNames = selectedModels.map((m) => m.table_name);
      steps.push({
        stage: 'plan',
        message: skipPlan && input.preselected
          ? 'Using user-selected tables'
          : 'Skipped planning (few tables)',
        tables: tableNames
      });
      await emit({
        stage: 'plan',
        status: 'done',
        tables: tableNames,
        planned_steps: plannedSteps,
        message: input.preselected
          ? 'Using user-selected tables'
          : 'Skipped planning (few tables)'
      });
    }

    await emit({
      stage: 'generate',
      status: 'start',
      tables: selectedModels.map((m) => m.table_name),
      message: 'Generating SQL...'
    });
    let generated = await generateSQL({
      prompt: input.prompt,
      connection_id: input.connection_id,
      dialect,
      models: selectedModels
    });
    steps.push({
      stage: 'generate',
      message: 'SQL generated',
      tables: selectedModels.map((m) => m.table_name)
    });
    await emit({
      stage: 'generate',
      status: 'done',
      tables: selectedModels.map((m) => m.table_name),
      message: 'SQL generated'
    });

    await emit({
      stage: 'params',
      status: 'start',
      message: 'Aligning parameters...'
    });
    generated = {
      ...generated,
      params: reconcileSqlParams(generated.sql, generated.params)
    };
    try {
      const typed = analyzeSql(generated.sql, dialect);
      generated = {
        ...generated,
        sql_type: typed.sql_type,
        method: typed.method
      };
    } catch {
      // keep AI-provided type when parse fails
    }
    steps.push({
      stage: 'params',
      message: `Aligned ${generated.params.length} parameter(s)`
    });
    await emit({
      stage: 'params',
      status: 'done',
      message: `Aligned ${generated.params.length} parameter(s)`
    });

    let needsRepair = plannedSteps.includes('review_fix');
    let issueMessages: string[] = [];
    try {
      const analysis = analyzeSql(generated.sql, dialect);
      const staticIssues = staticAuditSql(analysis);
      const errors = staticIssues.filter((i) => i.severity === 'error');
      if (errors.length > 0) {
        needsRepair = true;
        issueMessages = errors.map((i) => i.message);
      }
    } catch (err) {
      needsRepair = true;
      issueMessages = [
        err instanceof Error ? err.message : 'SQL analysis failed'
      ];
    }

    if (needsRepair) {
      const previousSuggestedName = generated.suggested_name;
      await emit({
        stage: 'repair',
        status: 'start',
        message: 'Repairing SQL...'
      });
      if (issueMessages.length === 0) {
        issueMessages = [
          'Plan requested a review/fix pass; improve correctness and keep :name placeholders.'
        ];
      }
      generated = await repairSQL({
        prompt: input.prompt,
        dialect,
        models: selectedModels,
        sql: generated.sql,
        issues: issueMessages
      });
      if (!generated.suggested_name && previousSuggestedName) {
        generated = {
          ...generated,
          suggested_name: previousSuggestedName
        };
      }
      generated = {
        ...generated,
        params: reconcileSqlParams(generated.sql, generated.params)
      };
      try {
        const typed = analyzeSql(generated.sql, dialect);
        generated = {
          ...generated,
          sql_type: typed.sql_type,
          method: typed.method
        };
      } catch {
        // keep AI-provided type when parse fails
      }
      steps.push({
        stage: 'repair',
        message: 'SQL repaired'
      });
      await emit({
        stage: 'repair',
        status: 'done',
        message: 'SQL repaired'
      });
    }

    return {
      ...generated,
      selected_tables: selectedModels.map((m) => m.table_name),
      steps
    };
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(503, `AI Service Unavailable: ${message}`);
  }
}
