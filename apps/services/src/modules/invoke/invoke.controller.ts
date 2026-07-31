import type { KoaContext } from '@axiosleo/koapp';
import { HttpError, HttpResponse } from '@axiosleo/koapp';
import Validator from 'validatorjs';
import { BaseController } from '../controller';
import { toSqlItem } from '../sql/sql.model';
import type { HttpMethod, SqlParamDef } from '../../types';
import { getConnectionConfig, getSql, insertInvokeLog, type SqlRecord } from '../../services/sqlite';
import { execute, executeScript, query } from '../../services/datasource';

export interface InvokeSelectResult {
  rows: Record<string, unknown>[];
  row_count: number;
}

export interface InvokeWriteResult {
  affected_rows: number;
  insert_id?: number;
}

export interface InvokeComplexResult {
  results: Array<
    | { kind: 'query'; rows: Record<string, unknown>[]; row_count: number }
    | { kind: 'execute'; affected_rows: number; insert_id?: number }
  >;
}

const METHOD_PARAM_SOURCE: Record<HttpMethod, 'query' | 'body'> = {
  GET: 'query',
  DELETE: 'query',
  POST: 'body',
  PATCH: 'body'
};

function extractRowCount(data: unknown): number | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const payload = data as Record<string, unknown>;
  if (typeof payload.row_count === 'number') {
    return payload.row_count;
  }
  if (typeof payload.affected_rows === 'number') {
    return payload.affected_rows;
  }
  if (Array.isArray(payload.results)) {
    let total = 0;
    for (const item of payload.results) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const row = item as Record<string, unknown>;
      if (typeof row.row_count === 'number') {
        total += row.row_count;
      } else if (typeof row.affected_rows === 'number') {
        total += row.affected_rows;
      }
    }
    return total;
  }
  return null;
}

function resolveErrorMessage(err: HttpResponse | HttpError | Error): string | null {
  if (err instanceof HttpResponse) {
    // Runtime HttpResponse carries `code` ("status;message"); typings omit it.
    const code = (err as HttpResponse & { code?: string }).code;
    if (code) {
      const parts = String(code).split(';');
      return parts.length > 1 ? parts.slice(1).join(';') : String(code);
    }
    return err.message || null;
  }
  return err.message || null;
}

export class InvokeController extends BaseController {
  async invoke(context: KoaContext) {
    const startedAt = Date.now();
    let record: SqlRecord | null = null;
    let method = (context.method || '').toUpperCase();
    let capturedParams: string | null = null;

    try {
      const appId = this.appId(context);
      const uuid = context.params?.uuid || '';

      record = getSql(appId, uuid);
      if (!record) {
        this.error(404, 'Not Found SQL');
      }

      const sql = toSqlItem(record!);
      method = sql.method;

      if (sql.status !== 'enabled') {
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

      try {
        const serialized = JSON.stringify(data);
        capturedParams =
          serialized.length > 8192
            ? `${serialized.slice(0, 8192)}…`
            : serialized;
      } catch {
        capturedParams = null;
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

      if (sql.sql_type === 'complex') {
        const script = await executeScript(config!, record!.sql_text, data);
        const payload: InvokeComplexResult = { results: script.results };
        this.success(payload);
      }

      const execResult = await execute(config!, record!.sql_text, data);
      const payload: InvokeWriteResult = {
        affected_rows: execResult.affected_rows,
        insert_id: execResult.insert_id
      };
      this.success(payload);
    } catch (err) {
      if (record) {
        try {
          const latency_ms = Date.now() - startedAt;
          if (err instanceof HttpResponse) {
            const ok = err.status === 200;
            insertInvokeLog({
              app_id: record.app_id,
              sql_id: record.id,
              connection_id: record.connection_id,
              method,
              status_code: err.status || (ok ? 200 : 500),
              success: ok,
              error_message: ok ? null : resolveErrorMessage(err),
              latency_ms,
              row_count: ok ? extractRowCount(err.data) : null,
              params: capturedParams
            });
          } else if (err instanceof HttpError) {
            insertInvokeLog({
              app_id: record.app_id,
              sql_id: record.id,
              connection_id: record.connection_id,
              method,
              status_code: err.status || 500,
              success: false,
              error_message: resolveErrorMessage(err),
              latency_ms,
              row_count: null,
              params: capturedParams
            });
          } else {
            const message = err instanceof Error ? err.message : String(err);
            insertInvokeLog({
              app_id: record.app_id,
              sql_id: record.id,
              connection_id: record.connection_id,
              method,
              status_code: 500,
              success: false,
              error_message: message,
              latency_ms,
              row_count: null,
              params: capturedParams
            });
          }
        } catch {
          // Logging must never break the original response path.
        }
      }
      throw err;
    }
  }
}

export default new InvokeController();
