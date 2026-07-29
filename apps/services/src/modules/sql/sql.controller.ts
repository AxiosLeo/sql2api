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
import { stubSql } from './sql.model';
import type { PaginatedResult, ReviewResult, SqlType } from '../../types';
import { generateSQL, reviewSQL } from '../../services/ai';

export class SqlController extends BaseController {
  async create(context: KoaContext) {
    const body = context.body as CreateSqlBody;

    // Stub review path: call AI service (currently always passes).
    // When review fails, respond with 422;SQL Review Failed + ReviewResult data.
    const review = await reviewSQL({
      sql: body.sql,
      connection_id: body.connection_id
    });

    if (!review.passed) {
      this.failed(review, '422;SQL Review Failed', 422);
    }

    const item = stubSql({
      connection_id: body.connection_id,
      name: body.name,
      description: body.description || '',
      sql: body.sql,
      params: body.params || [],
      review
    });
    this.success(item);
  }

  async generate(context: KoaContext) {
    const body = context.body as GenerateSqlBody;
    const generated = await generateSQL({
      prompt: body.prompt,
      connection_id: body.connection_id
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
    const body = context.body as ReviewSqlBody;
    const result: ReviewResult = await reviewSQL({
      sql: body.sql,
      connection_id: body.connection_id
    });
    this.success(result);
  }

  async list(context: KoaContext) {
    const query = (context.query || {}) as SqlListQuery;
    const page = Number(query.page) || 1;
    const size = Number(query.size) || 20;
    const item = stubSql({
      connection_id: query.connection_id || 'stub-connection-id',
      sql_type: (query.sql_type as SqlType) || 'select'
    });
    const result: PaginatedResult<SqlItem> = {
      list: [item],
      total: 1,
      page,
      size
    };
    this.success(result);
  }

  async detail(context: KoaContext) {
    this.success(stubSql({ id: context.params?.id }));
  }

  async update(context: KoaContext) {
    const body = (context.body || {}) as UpdateSqlBody;
    let review: ReviewResult = { passed: true, issues: [] };

    if (body.sql) {
      review = await reviewSQL({
        sql: body.sql,
        connection_id: body.connection_id
      });
      if (!review.passed) {
        this.failed(review, '422;SQL Review Failed', 422);
      }
    }

    this.success(stubSql({
      id: context.params?.id,
      ...body,
      review,
      updated_at: new Date().toISOString()
    }));
  }

  async remove(context: KoaContext) {
    this.success({ id: context.params?.id, deleted: true });
  }
}

export default new SqlController();
