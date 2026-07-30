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
import { detectSqlType, sqlTypeToMethod, toSqlItem } from './sql.model';
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
    appId: string,
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
    const appId = this.appId(context);
    const body = context.body as CreateSqlBody;

    const conn = getConnection(appId, body.connection_id);
    if (!conn) {
      this.error(404, 'Not Found Connection');
    }

    const sqlType = detectSqlType(body.sql, conn!.type);
    const method = sqlTypeToMethod(sqlType);
    const models = this.loadModelContexts(appId, body.connection_id);

    const review = await reviewSQL({
      sql: body.sql,
      connection_id: body.connection_id,
      dialect: conn!.type,
      models
    });

    if (!review.passed) {
      this.failed(review, '422;SQL Review Failed', 422);
    }

    try {
      const record = createSql({
        app_id: appId,
        connection_id: body.connection_id,
        name: body.name,
        description: body.description || '',
        sql_text: body.sql,
        sql_type: sqlType,
        method,
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

    const result: ReviewResult = await reviewSQL({
      sql: body.sql,
      connection_id: body.connection_id,
      dialect,
      models
    });
    this.success(result);
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
      sqlType = detectSqlType(body.sql, conn!.type);
      method = sqlTypeToMethod(sqlType);
      const models = this.loadModelContexts(appId, connectionId);
      review = await reviewSQL({
        sql: body.sql,
        connection_id: connectionId,
        dialect: conn!.type,
        models
      });
      if (!review.passed) {
        this.failed(review, '422;SQL Review Failed', 422);
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
