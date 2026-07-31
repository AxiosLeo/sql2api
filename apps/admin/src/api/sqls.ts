import { apiRequest } from '@/lib/api-client'

export type SqlType = 'select' | 'insert' | 'update' | 'complex'
export type HttpMethod = 'GET' | 'POST' | 'PATCH'
export type SqlStatus = 'enabled' | 'disabled'
export type ReviewSeverity = 'error' | 'warning' | 'info'

export interface SqlParamDef {
  name: string
  rule: string
  description?: string
  default?: unknown
}

export interface ReviewIssue {
  severity: ReviewSeverity
  message: string
  suggestion?: string
}

export interface ReviewResult {
  passed: boolean
  issues: ReviewIssue[]
  sql_type?: SqlType
  method?: HttpMethod
}

export interface SqlItem {
  id: string
  app_id: string
  connection_id: string
  name: string
  description: string
  sql: string
  sql_type: SqlType
  method: HttpMethod
  endpoint: string
  params: SqlParamDef[]
  status: SqlStatus
  review: ReviewResult
  created_at: string
  updated_at: string
}

export interface SqlListData {
  list: SqlItem[]
  total: number
  page: number
  size: number
}

export interface SqlListQuery {
  page?: number
  size?: number
  keyword?: string
  connection_id?: string
  sql_type?: SqlType
  app_id?: string
}

export interface CreateSqlBody {
  connection_id: string
  name: string
  description?: string
  sql: string
  params?: SqlParamDef[]
}

export interface UpdateSqlBody {
  connection_id?: string
  name?: string
  description?: string
  sql?: string
  params?: SqlParamDef[]
  status?: SqlStatus
}

export interface GenerateSqlBody {
  connection_id: string
  prompt: string
  model_ids?: string[]
}

export interface GenerateSqlResult {
  sql: string
  sql_type: string
  method: string
  params: SqlParamDef[]
  explanation: string
}

export interface ReviewSqlBody {
  sql: string
  connection_id?: string
}

export function listSqls(params: SqlListQuery = {}): Promise<SqlListData> {
  return apiRequest<SqlListData>({
    method: 'GET',
    url: '/api/sqls',
    params,
  })
}

export function createSql(body: CreateSqlBody): Promise<SqlItem> {
  return apiRequest<SqlItem>({
    method: 'POST',
    url: '/api/sqls',
    data: body,
  })
}

export function updateSql(id: string, body: UpdateSqlBody): Promise<SqlItem> {
  return apiRequest<SqlItem>({
    method: 'PATCH',
    url: `/api/sqls/${id}`,
    data: body,
  })
}

export function deleteSql(
  id: string
): Promise<{ id: string; deleted: boolean }> {
  return apiRequest<{ id: string; deleted: boolean }>({
    method: 'DELETE',
    url: `/api/sqls/${id}`,
  })
}

export function generateSql(
  body: GenerateSqlBody
): Promise<GenerateSqlResult> {
  return apiRequest<GenerateSqlResult>({
    method: 'POST',
    url: '/api/sqls/generate',
    data: body,
    timeout: 120_000,
  })
}

export function reviewSql(body: ReviewSqlBody): Promise<ReviewResult> {
  return apiRequest<ReviewResult>({
    method: 'POST',
    url: '/api/sqls/review',
    data: body,
    timeout: 120_000,
  })
}
