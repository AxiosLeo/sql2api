import { apiRequest } from '@/lib/api-client'

export interface InvocationTotals {
  total: number
  success: number
  failed: number
  avg_latency_ms: number
}

export interface StatsOverview {
  apps: number
  connections: number
  models: number
  sqls: number
  invocations: InvocationTotals
}

export interface InvokeDailyStat {
  date: string
  total: number
  success: number
  failed: number
}

export interface StatsSummary extends InvocationTotals {
  daily: InvokeDailyStat[]
}

export interface InvokeLogItem {
  id: number
  app_id: string
  sql_id: string
  sql_name: string | null
  connection_id: string | null
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  status_code: number
  success: boolean
  error_message: string | null
  latency_ms: number
  row_count: number | null
  created_at: string
}

export interface InvokeLogDetail extends InvokeLogItem {
  params: unknown
  sql_text: string | null
}

export interface StatsLogsData {
  list: InvokeLogItem[]
  total: number
  page: number
  size: number
}

export interface StatsSummaryQuery {
  days?: number
  sql_id?: string
  app_id?: string
}

export interface StatsLogsQuery {
  page?: number
  size?: number
  sql_id?: string
  success?: 'true' | 'false'
  app_id?: string
  start?: string
  end?: string
  latency_min?: number
  latency_max?: number
}

export function fetchStatsOverview(): Promise<StatsOverview> {
  return apiRequest<StatsOverview>({
    method: 'GET',
    url: '/api/stats/overview',
  })
}

export function fetchStatsSummary(
  params: StatsSummaryQuery = {}
): Promise<StatsSummary> {
  return apiRequest<StatsSummary>({
    method: 'GET',
    url: '/api/stats/summary',
    params,
  })
}

export function fetchStatsLogs(
  params: StatsLogsQuery = {}
): Promise<StatsLogsData> {
  return apiRequest<StatsLogsData>({
    method: 'GET',
    url: '/api/stats/logs',
    params,
  })
}

export function fetchStatsLogDetail(id: number): Promise<InvokeLogDetail> {
  return apiRequest<InvokeLogDetail>({
    method: 'GET',
    url: `/api/stats/logs/${id}`,
  })
}
