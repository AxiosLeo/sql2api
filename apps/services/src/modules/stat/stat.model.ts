import type { PaginationQuery } from '../../types';
import { paginationRules } from '../../types';
import type {
  EntityCounts,
  InvokeDailyStat,
  InvokeLogDetailRecord,
  InvokeLogListRecord,
  InvokeStatsResult
} from '../../services/sqlite';

export interface InvokeLogItem {
  id: number;
  app_id: string;
  sql_id: string;
  sql_name: string | null;
  connection_id: string | null;
  method: string;
  status_code: number;
  success: boolean;
  error_message: string | null;
  latency_ms: number;
  row_count: number | null;
  created_at: string;
}

export interface InvokeLogDetailItem extends InvokeLogItem {
  params: unknown;
  sql_text: string | null;
}

/** Dashboard overview: global entity counts + last-30-day invocation summary. */
export interface StatsOverviewResult extends EntityCounts {
  invocations: Omit<InvokeStatsResult, 'daily'>;
}

export interface StatsSummaryQuery {
  days?: number;
  sql_id?: string;
  app_id?: string;
}

export interface StatsLogsQuery extends PaginationQuery {
  sql_id?: string;
  success?: string | boolean | number;
  app_id?: string;
  start?: string;
  end?: string;
}

export type { InvokeDailyStat, InvokeStatsResult };

export function toInvokeLogItem(record: InvokeLogListRecord): InvokeLogItem {
  return {
    id: record.id,
    app_id: record.app_id,
    sql_id: record.sql_id,
    sql_name: record.sql_name ?? null,
    connection_id: record.connection_id,
    method: record.method,
    status_code: record.status_code,
    success: record.success === 1,
    error_message: record.error_message,
    latency_ms: record.latency_ms,
    row_count: record.row_count,
    created_at: record.created_at
  };
}

export function toInvokeLogDetailItem(
  record: InvokeLogDetailRecord
): InvokeLogDetailItem {
  let params: unknown = null;
  if (record.params) {
    try {
      params = JSON.parse(record.params);
    } catch {
      params = record.params;
    }
  }

  return {
    ...toInvokeLogItem(record),
    params,
    sql_text: record.sql_text ?? null
  };
}

export function parseSuccessFilter(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  const normalized = String(value).toLowerCase();
  if (normalized === '1' || normalized === 'true') {
    return true;
  }
  if (normalized === '0' || normalized === 'false') {
    return false;
  }
  return undefined;
}

export const statsSummaryQueryRules = {
  days: 'integer|min:1|max:30',
  sql_id: 'string',
  app_id: 'string'
};

export const statsLogsQueryRules = {
  ...paginationRules,
  sql_id: 'string',
  success: 'string',
  app_id: 'string',
  start: 'string',
  end: 'string'
};

export const statsLogIdRules = {
  id: 'required|integer'
};
