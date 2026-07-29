import type { KoaContext } from '@axiosleo/koapp';
import Validator from 'validatorjs';
import { BaseController } from '../controller';
import { stubSql } from '../sql/sql.model';
import type { HttpMethod } from '../../types';

export interface InvokeSelectResult {
  rows: Record<string, unknown>[];
  row_count: number;
}

export interface InvokeWriteResult {
  affected_rows: number;
  insert_id?: number;
}

const METHOD_PARAM_SOURCE: Record<HttpMethod, 'query' | 'body'> = {
  GET: 'query',
  DELETE: 'query',
  POST: 'body',
  PATCH: 'body'
};

export class InvokeController extends BaseController {
  async invoke(context: KoaContext) {
    const uuid = context.params?.uuid || '';
    // Stub: look up registered SQL by uuid + app_id
    const sql = stubSql({ id: uuid });

    if (sql.status === 'disabled') {
      this.error(403, 'Not Authorized');
    }

    const requestMethod = (context.method || '').toUpperCase() as HttpMethod;
    if (requestMethod !== sql.method) {
      this.failed(
        { expected: sql.method, actual: requestMethod },
        '405;Method Not Allowed',
        405
      );
    }

    const source = METHOD_PARAM_SOURCE[sql.method];
    const data: Record<string, unknown> = source === 'query'
      ? (context.query as Record<string, unknown>) || {}
      : (context.body as Record<string, unknown>) || {};

    // Apply defaults then validate with stored validatorjs rules
    const rules: Record<string, string> = {};
    for (const param of sql.params) {
      rules[param.name] = param.rule;
      if (data[param.name] === undefined && param.default !== undefined) {
        data[param.name] = param.default;
      }
    }

    if (Object.keys(rules).length > 0) {
      const validation = new Validator(data, rules);
      if (validation.fails()) {
        this.failed(
          { errors: validation.errors.all() },
          '400;Bad Data',
          400
        );
      }
    }

    // Stub execution — real mysql2 / pg path lands later
    if (sql.sql_type === 'select') {
      const result: InvokeSelectResult = {
        rows: [{ id: 1, name: 'stub' }],
        row_count: 1
      };
      this.success(result);
    }

    const result: InvokeWriteResult = {
      affected_rows: 1,
      insert_id: sql.sql_type === 'insert' ? 1 : undefined
    };
    this.success(result);
  }
}

export default new InvokeController();
