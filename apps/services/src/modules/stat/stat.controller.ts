import type { KoaContext } from '@axiosleo/koapp';
import { BaseController } from '../controller';
import type { PaginatedResult } from '../../types';
import {
  getEntityCounts,
  getInvokeLog,
  getInvokeStats,
  listInvokeLogs
} from '../../services/sqlite';
import {
  parseSuccessFilter,
  toInvokeLogDetailItem,
  toInvokeLogItem,
  type InvokeLogItem,
  type InvokeStatsResult,
  type StatsLogsQuery,
  type StatsOverviewResult,
  type StatsSummaryQuery
} from './stat.model';

export class StatController extends BaseController {
  /** Dashboard overview: global entity counts + last-30-day invocation summary. */
  async overview(context: KoaContext) {
    const appId = this.appId(context);
    const counts = getEntityCounts();
    const stats = getInvokeStats(appId, { days: 30 });

    const payload: StatsOverviewResult = {
      ...counts,
      invocations: {
        total: stats.total,
        success: stats.success,
        failed: stats.failed,
        avg_latency_ms: stats.avg_latency_ms
      }
    };
    this.success(payload);
  }

  async summary(context: KoaContext) {
    const appId = this.appId(context);
    const query = (context.query || {}) as StatsSummaryQuery;
    const days = query.days ? Number(query.days) : 30;
    const sqlId = typeof query.sql_id === 'string' && query.sql_id
      ? query.sql_id
      : undefined;

    const payload: InvokeStatsResult = getInvokeStats(appId, {
      days: Number.isFinite(days) ? days : 30,
      sql_id: sqlId
    });
    this.success(payload);
  }

  async logs(context: KoaContext) {
    const appId = this.appId(context);
    const query = (context.query || {}) as StatsLogsQuery;
    const page = query.page ? Number(query.page) : 1;
    const size = query.size ? Number(query.size) : 20;
    const sqlId = typeof query.sql_id === 'string' && query.sql_id
      ? query.sql_id
      : undefined;
    const success = parseSuccessFilter(query.success);

    let start: string | undefined;
    let end: string | undefined;
    if (typeof query.start === 'string' && query.start) {
      const parsed = new Date(query.start);
      if (Number.isNaN(parsed.getTime())) {
        this.error(400, 'Invalid start time');
      }
      start = parsed.toISOString();
    }
    if (typeof query.end === 'string' && query.end) {
      const parsed = new Date(query.end);
      if (Number.isNaN(parsed.getTime())) {
        this.error(400, 'Invalid end time');
      }
      end = parsed.toISOString();
    }
    if (start && end && end < start) {
      this.error(400, 'End time must be after start time');
    }

    const result = listInvokeLogs(appId, {
      page: Number.isFinite(page) ? page : 1,
      size: Number.isFinite(size) ? size : 20,
      sql_id: sqlId,
      success,
      start,
      end
    });

    const payload: PaginatedResult<InvokeLogItem> = {
      list: result.list.map(toInvokeLogItem),
      total: result.total,
      page: result.page,
      size: result.size
    };
    this.success(payload);
  }

  async logDetail(context: KoaContext) {
    const appId = this.appId(context);
    const id = Number(context.params?.id);
    if (!Number.isFinite(id)) {
      this.error(400, 'Invalid log id');
    }

    const record = getInvokeLog(id);
    if (!record || (appId && record.app_id !== appId)) {
      this.error(404, 'Not Found Log');
    }

    this.success(toInvokeLogDetailItem(record!));
  }
}

export default new StatController();
