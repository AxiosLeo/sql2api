import type { KoaContext } from '@axiosleo/koapp';
import Validator from 'validatorjs';
import { BaseController } from '../controller';
import { toSqlItem } from '../sql/sql.model';
import type { HttpMethod, SqlParamDef } from '../../types';
import { getConnectionConfig, getSql } from '../../services/sqlite';
import { execute, query } from '../../services/datasource';

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
    const appId = this.appId(context);
    const uuid = context.params?.uuid || '';

    const record = getSql(appId, uuid);
    if (!record) {
      this.error(404, 'Not Found SQL');
    }

    const sql = toSqlItem(record!);

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
    const raw: Record<string, unknown> = source === 'query'
      ? { ...((context.query as Record<string, unknown>) || {}) }
      : { ...((context.body as Record<string, unknown>) || {}) };

    // Collect only declared params; apply defaults; validate with stored rules
    const data: Record<string, unknown> = {};
    const rules: Record<string, string> = {};
    for (const param of sql.params as SqlParamDef[]) {
      if (raw[param.name] !== undefined) {
        data[param.name] = raw[param.name];
      } else if (param.default !== undefined) {
        data[param.name] = param.default;
      }
      rules[param.name] = param.rule;
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

    const config = getConnectionConfig(appId, record!.connection_id);
    if (!config) {
      this.error(404, 'Not Found Connection');
    }

    if (sql.sql_type === 'select') {
      const result = await query(config!, record!.sql_text, data);
      const payload: InvokeSelectResult = {
        rows: result.rows,
        row_count: result.row_count
      };
      this.success(payload);
    }

    const execResult = await execute(config!, record!.sql_text, data);
    const payload: InvokeWriteResult = {
      affected_rows: execResult.affected_rows,
      insert_id: execResult.insert_id
    };
    this.success(payload);
  }
}

export default new InvokeController();
