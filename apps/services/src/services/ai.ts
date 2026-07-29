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
      enum: ['select', 'insert', 'update', 'delete']
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
    explanation: { type: 'string' }
  },
  required: ['sql', 'sql_type', 'params', 'explanation']
} as const;

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

async function runWithGrammar<T>(
  systemPrompt: string,
  userPrompt: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any
): Promise<T> {
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
        maxTokens: 1024,
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
      'Set passed=false if there are any severity=error issues (SQL injection risk, destructive ops without WHERE, syntax errors, etc.).',
      'Warnings/info alone may still allow passed=true.'
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
    const systemPrompt = [
      'You are a senior SQL engineer.',
      `Generate a single ${dialect} SQL statement from the user request.`,
      'Use named placeholders like :param_name (not ? or $1).',
      'Include validatorjs-style rules for each param (e.g. required|integer).',
      'Return ONLY JSON matching the schema.'
    ].join(' ');

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
    }>(systemPrompt, userPrompt, GENERATE_SCHEMA);

    const sqlType = (['select', 'insert', 'update', 'delete'].includes(result.sql_type)
      ? result.sql_type
      : 'select') as SqlType;

    return {
      sql: result.sql,
      sql_type: sqlType,
      method: SQL_TYPE_TO_METHOD[sqlType],
      params: Array.isArray(result.params) ? result.params : [],
      explanation: result.explanation || ''
    };
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new HttpError(503, `AI Service Unavailable: ${message}`);
  }
}
