import type { KoaContext } from '@axiosleo/koapp';
import { BaseController } from '../controller';
import type {
  CreateSqlBody,
  GenerateResult,
  GenerateSqlBody,
  ReviewSqlBody,
  SqlItem,
  SqlListQuery,
  UpdateSqlBody
} from './sql.model';
import {
  analyzeSql,
  mergeReviewResults,
  staticAuditSql,
  toSqlItem
} from './sql.model';
import type { ColumnDefinition, PaginatedResult, ReviewResult } from '../../types';
import type { ModelContext } from '../../services/ai';
import { generateSQL, reviewSQL } from '../../services/ai';
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

function parseColumns(json: string): ColumnDefinition[] {
  try {
    const cols = JSON.parse(json || '[]') as ColumnDefinition[];
    return Array.isArray(cols) ? cols : [];
  } catch {
    return [];
  }
}

export class SqlController extends BaseController {
  private loadModelContexts(
    appId: string | null,
    connectionId: string,
    modelIds?: string[]
  ): ModelContext[] {
    const { list } = listModels(appId, { connection_id: connectionId, size: 100 });
    let records: ModelRecord[] = list;
    if (modelIds && modelIds.length > 0) {
      const idSet = new Set(modelIds);
      records = records.filter((m) => idSet.has(m.id));
    }
    return records.map((m) => ({
      table_name: m.table_name,
      comment: m.comment || '',
      columns: parseColumns(m.columns_json)
    }));
  }

  async create(context: KoaContext) {
    const scope = this.appId(context);
    const body = context.body as CreateSqlBody;

    const conn = getConnection(scope, body.connection_id);
    if (!conn) {
      this.error(404, 'Not Found Connection');
    }

    const analysis = analyzeSql(body.sql, conn!.type);
    const staticIssues = staticAuditSql(analysis);
    if (staticIssues.some((i) => i.severity === 'error')) {
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

    const models = this.loadModelContexts(conn!.app_id, body.connection_id);
    const aiReview = await reviewSQL({
      sql: body.sql,
      connection_id: body.connection_id,
      dialect: conn!.type,
      models
    });
    const review = mergeReviewResults(staticIssues, aiReview);

    if (!review.passed) {
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
        review
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

    const conn = getConnection(appId, body.connection_id);
    if (!conn) {
      this.error(404, 'Not Found Connection');
    }

    const models = this.loadModelContexts(appId, body.connection_id, body.model_ids);
    const generated = await generateSQL({
      prompt: body.prompt,
      connection_id: body.connection_id,
      dialect: conn!.type,
      models
    });
    const result: GenerateResult = {
      sql: generated.sql,
      sql_type: generated.sql_type,
      method: generated.method,
      params: generated.params,
      explanation: generated.explanation
    };
    this.success(result);
  }

  async review(context: KoaContext) {
    const appId = this.appId(context);
    const body = context.body as ReviewSqlBody;

    let dialect: 'mysql' | 'postgresql' = 'mysql';
    let models: ModelContext[] = [];

    if (body.connection_id) {
      const conn = getConnection(appId, body.connection_id);
      if (!conn) {
        this.error(404, 'Not Found Connection');
      }
      dialect = conn!.type;
      models = this.loadModelContexts(appId, body.connection_id);
    }

    const analysis = analyzeSql(body.sql, dialect);
    const staticIssues = staticAuditSql(analysis);

    let aiReview: ReviewResult = { passed: true, issues: [] };
    if (!staticIssues.some((i) => i.severity === 'error')) {
      aiReview = await reviewSQL({
        sql: body.sql,
        connection_id: body.connection_id,
        dialect,
        models
      });
    }

    const result = mergeReviewResults(staticIssues, aiReview);
    this.success({
      ...result,
      sql_type: analysis.sql_type,
      method: analysis.method
    });
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

    let sqlType = existing!.sql_type;
    let method = existing!.method;
    let review: ReviewResult | undefined;

    if (body.sql !== undefined && body.sql !== existing!.sql_text) {
      const analysis = analyzeSql(body.sql, conn!.type);
      sqlType = analysis.sql_type;
      method = analysis.method;

      const staticIssues = staticAuditSql(analysis);
      if (staticIssues.some((i) => i.severity === 'error')) {
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

      const models = this.loadModelContexts(appId, connectionId);
      const aiReview = await reviewSQL({
        sql: body.sql,
        connection_id: connectionId,
        dialect: conn!.type,
        models
      });
      review = mergeReviewResults(staticIssues, aiReview);
      if (!review.passed) {
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
    }

    try {
      const record = updateSql(appId, id, {
        connection_id: body.connection_id,
        name: body.name,
        description: body.description,
        sql_text: body.sql,
        sql_type: body.sql !== undefined ? sqlType : undefined,
        method: body.sql !== undefined ? method : undefined,
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
