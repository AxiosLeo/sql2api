import crypto from 'crypto';
import type { KoaContext } from '@axiosleo/koapp';
import { HttpError, middlewares } from '@axiosleo/koapp';
import { BaseController } from '../controller';
import type {
  ApplyReviewBody,
  CreateSqlBody,
  GenerateNameBody,
  GenerateResult,
  GenerateSqlBody,
  ReviewSqlBody,
  SqlItem,
  SqlListQuery,
  UpdateSqlBody
} from './sql.model';
import {
  analyzeSql,
  extractTableNames,
  mergeReviewResults,
  staticAuditSql,
  toSqlItem
} from './sql.model';
import type {
  ColumnDefinition,
  DatasourceType,
  PaginatedResult,
  ReviewIssue,
  ReviewResult,
  SqlStatus
} from '../../types';
import type { GenerateProgressEvent, ModelContext } from '../../services/ai';
import { applyReviewSuggestions, generateApiName, generateSQLPipeline, reviewSQL } from '../../services/ai';
import {
  createSql,
  deleteSql,
  getConnection,
  getSql,
  listModels,
  listSqls,
  updateSql,
  type ModelRecord
} from '../../services/sqlite';
import { buildSqlSpec } from '../../services/openapi-spec';

const { KoaSSEMiddleware } = middlewares;

const REVIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const REVIEW_CACHE_MAX = 50;

interface ReviewCacheEntry {
  review: ReviewResult;
  sql_type: string;
  method: string;
  expiresAt: number;
}

const reviewCache = new Map<string, ReviewCacheEntry>();

function reviewCacheKey(
  sql: string,
  connectionId: string,
  dialect: DatasourceType
): string {
  return crypto
    .createHash('sha256')
    .update(`${connectionId}\0${dialect}\0${sql}`)
    .digest('hex');
}

function getCachedReview(
  sql: string,
  connectionId: string,
  dialect: DatasourceType
): ReviewCacheEntry | null {
  const key = reviewCacheKey(sql, connectionId, dialect);
  const entry = reviewCache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    reviewCache.delete(key);
    return null;
  }
  // Refresh LRU order
  reviewCache.delete(key);
  reviewCache.set(key, entry);
  return entry;
}

function setCachedReview(
  sql: string,
  connectionId: string,
  dialect: DatasourceType,
  entry: Omit<ReviewCacheEntry, 'expiresAt'>
): void {
  const key = reviewCacheKey(sql, connectionId, dialect);
  if (reviewCache.has(key)) {
    reviewCache.delete(key);
  }
  while (reviewCache.size >= REVIEW_CACHE_MAX) {
    const oldest = reviewCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    reviewCache.delete(oldest);
  }
  reviewCache.set(key, {
    ...entry,
    expiresAt: Date.now() + REVIEW_CACHE_TTL_MS
  });
}

function parseColumns(json: string): ColumnDefinition[] {
  try {
    const cols = JSON.parse(json || '[]') as ColumnDefinition[];
    return Array.isArray(cols) ? cols : [];
  } catch {
    return [];
  }
}

function draftReviewIssues(staticIssues: ReviewIssue[]): ReviewIssue[] {
  return [
    ...staticIssues,
    {
      severity: 'info',
      message: 'Saved as draft — not reviewed',
      suggestion: 'Run Review and save as Enabled before invoking via OpenAPI.'
    }
  ];
}

export class SqlController extends BaseController {
  private loadModelContexts(
    appId: string | null,
    connectionId: string,
    modelIds?: string[],
    tableNames?: string[]
  ): ModelContext[] {
    const { list } = listModels(appId, { connection_id: connectionId, size: 100 });
    let records: ModelRecord[] = list;
    if (modelIds && modelIds.length > 0) {
      const idSet = new Set(modelIds);
      records = records.filter((m) => idSet.has(m.id));
    } else if (tableNames && tableNames.length > 0) {
      const tableSet = new Set(tableNames.map((t) => t.toLowerCase()));
      const filtered = records.filter((m) =>
        tableSet.has(m.table_name.toLowerCase())
      );
      // Fall back to full catalog when no referenced tables match models.
      if (filtered.length > 0) {
        records = filtered;
      }
    }
    return records.map((m) => ({
      table_name: m.table_name,
      comment: m.comment || '',
      columns: parseColumns(m.columns_json)
    }));
  }

  private async runAiReview(opts: {
    appId: string | null;
    sql: string;
    connectionId: string;
    dialect: DatasourceType;
    staticIssues: ReviewIssue[];
  }): Promise<ReviewResult> {
    const tables = extractTableNames(opts.sql, opts.dialect);
    const models = this.loadModelContexts(
      opts.appId,
      opts.connectionId,
      undefined,
      tables
    );
    const aiReview = await reviewSQL({
      sql: opts.sql,
      connection_id: opts.connectionId,
      dialect: opts.dialect,
      models
    });
    return mergeReviewResults(opts.staticIssues, aiReview);
  }

  /**
   * Full review (static + AI), using cache when available.
   * Throws via this.failed on static/AI error-severity failures when `block` is true.
   */
  private async runFullReview(opts: {
    appId: string | null;
    sql: string;
    connectionId: string;
    dialect: DatasourceType;
    block: boolean;
  }): Promise<{ review: ReviewResult; sql_type: string; method: string }> {
    const analysis = analyzeSql(opts.sql, opts.dialect);
    const staticIssues = staticAuditSql(analysis);

    if (opts.block && staticIssues.some((i) => i.severity === 'error')) {
      this.failed(
        {
          passed: false,
          issues: staticIssues,
          sql_type: analysis.sql_type,
          method: analysis.method
        },
        '422;SQL Review Failed',
        422
      );
    }

    const cached = getCachedReview(opts.sql, opts.connectionId, opts.dialect);
    if (cached) {
      if (opts.block && !cached.review.passed) {
        this.failed(
          {
            ...cached.review,
            sql_type: cached.sql_type,
            method: cached.method
          },
          '422;SQL Review Failed',
          422
        );
      }
      return {
        review: cached.review,
        sql_type: cached.sql_type,
        method: cached.method
      };
    }

    let review: ReviewResult;
    if (staticIssues.some((i) => i.severity === 'error')) {
      review = { passed: false, issues: staticIssues };
    } else {
      review = await this.runAiReview({
        appId: opts.appId,
        sql: opts.sql,
        connectionId: opts.connectionId,
        dialect: opts.dialect,
        staticIssues
      });
    }

    setCachedReview(opts.sql, opts.connectionId, opts.dialect, {
      review,
      sql_type: analysis.sql_type,
      method: analysis.method
    });

    if (opts.block && !review.passed) {
      this.failed(
        {
          ...review,
          sql_type: analysis.sql_type,
          method: analysis.method
        },
        '422;SQL Review Failed',
        422
      );
    }

    return {
      review,
      sql_type: analysis.sql_type,
      method: analysis.method
    };
  }

  private async runGeneratePipeline(
    appId: string | null,
    body: GenerateSqlBody,
    onProgress?: (event: GenerateProgressEvent) => void | Promise<void>
  ): Promise<GenerateResult> {
    const conn = getConnection(appId, body.connection_id);
    if (!conn) {
      throw new HttpError(404, 'Not Found Connection');
    }

    const preselected = Boolean(body.model_ids && body.model_ids.length > 0);
    const models = this.loadModelContexts(appId, body.connection_id, body.model_ids);
    const generated = await generateSQLPipeline(
      {
        prompt: body.prompt,
        connection_id: body.connection_id,
        dialect: conn.type,
        models,
        preselected
      },
      onProgress
    );

    return {
      sql: generated.sql,
      sql_type: generated.sql_type,
      method: generated.method,
      params: generated.params,
      explanation: generated.explanation,
      suggested_name: generated.suggested_name || undefined,
      selected_tables: generated.selected_tables,
      steps: generated.steps
    };
  }

  async create(context: KoaContext) {
    const scope = this.appId(context);
    const body = context.body as CreateSqlBody;
    const targetStatus: SqlStatus = body.status === 'draft' ? 'draft' : 'enabled';

    const conn = getConnection(scope, body.connection_id);
    if (!conn) {
      this.error(404, 'Not Found Connection');
    }

    const analysis = analyzeSql(body.sql, conn!.type);
    const staticIssues = staticAuditSql(analysis);

    let review: ReviewResult;

    if (targetStatus === 'draft') {
      review = {
        passed: false,
        issues: draftReviewIssues(staticIssues)
      };
    } else {
      const full = await this.runFullReview({
        appId: conn!.app_id,
        sql: body.sql,
        connectionId: body.connection_id,
        dialect: conn!.type,
        block: true
      });
      review = full.review;
    }

    try {
      const record = createSql({
        app_id: conn!.app_id,
        connection_id: body.connection_id,
        name: body.name,
        description: body.description || '',
        sql_text: body.sql,
        sql_type: analysis.sql_type,
        method: analysis.method,
        params: body.params || [],
        review,
        status: targetStatus
      });
      this.success(toSqlItem(record));
    } catch (err) {
      if (this.isUniqueConstraintError(err)) {
        this.failed({ name: body.name }, '409;Data Already Exists', 409);
      }
      throw err;
    }
  }

  async generate(context: KoaContext) {
    const appId = this.appId(context);
    const body = context.body as GenerateSqlBody;
    try {
      const result = await this.runGeneratePipeline(appId, body);
      this.success(result);
    } catch (err) {
      if (err instanceof HttpError) {
        this.error(err.status || 500, err.message);
      }
      throw err;
    }
  }

  async generateName(context: KoaContext) {
    const body = (context.body || {}) as GenerateNameBody;
    const prompt = (body.prompt || '').trim();
    const sql = (body.sql || '').trim();
    if (!prompt && !sql) {
      this.error(400, 'Either prompt or sql is required');
    }

    try {
      const name = await generateApiName({
        prompt: prompt || undefined,
        sql: sql || undefined,
        params: body.params
      });
      this.success({ name });
    } catch (err) {
      if (err instanceof HttpError) {
        this.error(err.status || 500, err.message);
      }
      throw err;
    }
  }

  /**
   * SSE streaming generate: progress events then a final `done` or `error`.
   * Does not use success/failed — SSE owns the response body.
   */
  async generateStream(context: KoaContext) {
    const appId = this.appId(context);
    const body = context.body as GenerateSqlBody;

    context.koa.set('X-Accel-Buffering', 'no');
    const sse = KoaSSEMiddleware({ pingInterval: 15000 });
    await sse(context.koa, async () => {});

    const send = (event: string, data: object) => {
      if (!context.koa.sse) {
        return;
      }
      context.koa.sse.send({ event, data });
    };

    try {
      const result = await this.runGeneratePipeline(appId, body, async (event) => {
        send('progress', event);
      });
      send('done', result);
    } catch (err) {
      const status = err instanceof HttpError ? (err.status || 500) : 500;
      const message = err instanceof Error ? err.message : String(err);
      send('error', { status, message });
    } finally {
      if (context.koa.sse) {
        context.koa.sse.close();
      }
    }
  }

  async review(context: KoaContext) {
    const appId = this.appId(context);
    const body = context.body as ReviewSqlBody;

    let dialect: DatasourceType = 'mysql';
    let connectionId = body.connection_id || '';

    if (body.connection_id) {
      const conn = getConnection(appId, body.connection_id);
      if (!conn) {
        this.error(404, 'Not Found Connection');
      }
      dialect = conn!.type;
      connectionId = body.connection_id;
    }

    const analysis = analyzeSql(body.sql, dialect);
    const staticIssues = staticAuditSql(analysis);

    // Always re-run AI review (no cache read) so model swaps take effect.
    // Still write cache so a subsequent Save can reuse this result.
    let review: ReviewResult;
    if (staticIssues.some((i) => i.severity === 'error')) {
      review = { passed: false, issues: staticIssues };
    } else if (connectionId) {
      review = await this.runAiReview({
        appId,
        sql: body.sql,
        connectionId,
        dialect,
        staticIssues
      });
    } else {
      review = mergeReviewResults(staticIssues, { passed: true, issues: [] });
    }

    if (connectionId) {
      setCachedReview(body.sql, connectionId, dialect, {
        review,
        sql_type: analysis.sql_type,
        method: analysis.method
      });
    }

    this.success({
      ...review,
      sql_type: analysis.sql_type,
      method: analysis.method
    });
  }

  async applyReview(context: KoaContext) {
    const appId = this.appId(context);
    const body = context.body as ApplyReviewBody;

    const conn = getConnection(appId, body.connection_id);
    if (!conn) {
      this.error(404, 'Not Found Connection');
    }

    const issues = (body.issues || [])
      .map((issue) => {
        const severity = (issue.severity || '').trim();
        const message = (issue.message || '').trim();
        const suggestion = (issue.suggestion || '').trim();
        if (!message) return '';
        const parts: string[] = [];
        if (severity) parts.push(`[${severity}]`);
        parts.push(message);
        if (suggestion) parts.push(`| Suggestion: ${suggestion}`);
        return parts.join(' ');
      })
      .filter(Boolean);

    if (issues.length === 0) {
      this.error(400, 'At least one review issue is required');
    }

    const tables = extractTableNames(body.sql, conn!.type);
    const models = this.loadModelContexts(
      appId,
      body.connection_id,
      undefined,
      tables
    );

    try {
      const result = await applyReviewSuggestions({
        sql: body.sql,
        dialect: conn!.type,
        models,
        issues
      });
      this.success({
        sql: result.sql,
        sql_type: result.sql_type,
        method: result.method,
        params: result.params,
        explanation: result.explanation
      });
    } catch (err) {
      if (err instanceof HttpError) {
        this.error(err.status || 500, err.message);
      }
      throw err;
    }
  }

  async list(context: KoaContext) {
    const appId = this.appId(context);
    const query = (context.query || {}) as SqlListQuery;
    const page = Number(query.page) || 1;
    const size = Number(query.size) || 20;

    const result = listSqls(appId, {
      page,
      size,
      keyword: query.keyword,
      connection_id: query.connection_id,
      sql_type: query.sql_type
    });

    const payload: PaginatedResult<SqlItem> = {
      list: result.list.map(toSqlItem),
      total: result.total,
      page: result.page,
      size: result.size
    };
    this.success(payload);
  }

  async detail(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const record = getSql(appId, id);
    if (!record) {
      this.error(404, 'Not Found SQL');
    }
    this.success(toSqlItem(record!));
  }

  /** Self-contained OpenAPI document for a single registered SQL. */
  async openapiDoc(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const record = getSql(appId, id);
    if (!record) {
      this.error(404, 'Not Found SQL');
    }

    const koaReq = context.koa?.request as
      | { origin?: string; protocol?: string; host?: string }
      | undefined;
    let serverUrl = 'http://127.0.0.1:13334';
    if (koaReq?.origin) {
      serverUrl = koaReq.origin;
    } else {
      const host =
        (typeof context.headers?.host === 'string' && context.headers.host)
        || koaReq?.host
        || '127.0.0.1:13334';
      const protoHeader = context.headers?.['x-forwarded-proto'];
      const proto =
        (typeof protoHeader === 'string' && protoHeader.split(',')[0].trim())
        || koaReq?.protocol
        || 'http';
      serverUrl = `${proto}://${host}`;
    }

    this.success(buildSqlSpec(record!, { serverUrl }));
  }

  async update(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const body = (context.body || {}) as UpdateSqlBody;

    const existing = getSql(appId, id);
    if (!existing) {
      this.error(404, 'Not Found SQL');
    }

    const connectionId = body.connection_id || existing!.connection_id;
    if (body.connection_id && body.connection_id !== existing!.connection_id) {
      const conn = getConnection(appId, body.connection_id);
      if (!conn) {
        this.error(404, 'Not Found Connection');
      }
    }

    const conn = getConnection(appId, connectionId);
    if (!conn) {
      this.error(404, 'Not Found Connection');
    }

    const targetStatus: SqlStatus = body.status ?? existing!.status;
    const sqlText = body.sql !== undefined ? body.sql : existing!.sql_text;
    const sqlChanged =
      body.sql !== undefined && body.sql !== existing!.sql_text;
    const promotingFromDraft =
      existing!.status === 'draft' && targetStatus !== 'draft';

    let sqlType = existing!.sql_type;
    let method = existing!.method;
    let review: ReviewResult | undefined;

    if (targetStatus === 'draft') {
      const analysis = analyzeSql(sqlText, conn!.type);
      sqlType = analysis.sql_type;
      method = analysis.method;
      const staticIssues = staticAuditSql(analysis);
      review = {
        passed: false,
        issues: draftReviewIssues(staticIssues)
      };
    } else if (sqlChanged || promotingFromDraft) {
      const full = await this.runFullReview({
        appId,
        sql: sqlText,
        connectionId,
        dialect: conn!.type,
        block: true
      });
      review = full.review;
      sqlType = full.sql_type as typeof sqlType;
      method = full.method as typeof method;
    }

    try {
      const record = updateSql(appId, id, {
        connection_id: body.connection_id,
        name: body.name,
        description: body.description,
        sql_text: body.sql,
        sql_type:
          body.sql !== undefined || targetStatus === 'draft' || promotingFromDraft
            ? sqlType
            : undefined,
        method:
          body.sql !== undefined || targetStatus === 'draft' || promotingFromDraft
            ? method
            : undefined,
        params: body.params,
        review,
        status: body.status
      });
      if (!record) {
        this.error(404, 'Not Found SQL');
      }
      this.success(toSqlItem(record!));
    } catch (err) {
      if (this.isUniqueConstraintError(err)) {
        this.failed({ name: body.name }, '409;Data Already Exists', 409);
      }
      throw err;
    }
  }

  async remove(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const ok = deleteSql(appId, id);
    if (!ok) {
      this.error(404, 'Not Found SQL');
    }
    this.success({ id, deleted: true });
  }
}

export default new SqlController();
