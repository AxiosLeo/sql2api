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

export interface GenerateStepSummary {
  stage: string
  message: string
  tables?: string[]
}

export interface GenerateSqlResult {
  sql: string
  sql_type: string
  method: string
  params: SqlParamDef[]
  explanation: string
  suggested_name?: string
  selected_tables?: string[]
  steps?: GenerateStepSummary[]
}

export type GenerateProgressStage = 'plan' | 'generate' | 'params' | 'repair'

export interface GenerateProgressEvent {
  stage: GenerateProgressStage
  status: 'start' | 'done'
  tables?: string[]
  planned_steps?: string[]
  message?: string
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

export interface GenerateNameBody {
  prompt?: string
  sql?: string
  params?: string[]
}

export function generateSqlName(
  body: GenerateNameBody
): Promise<{ name: string }> {
  return apiRequest<{ name: string }>({
    method: 'POST',
    url: '/api/sqls/generate-name',
    data: body,
    timeout: 120_000,
  })
}

const STREAM_TIMEOUT_MS = 300_000

function parseSseFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = []
  let rest = buffer
  let idx = rest.indexOf('\n\n')
  while (idx !== -1) {
    frames.push(rest.slice(0, idx))
    rest = rest.slice(idx + 2)
    idx = rest.indexOf('\n\n')
  }
  return { frames, rest }
}

function parseSseFrame(frame: string): { event: string; data: string } {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  return { event, data: dataLines.join('\n') }
}

export class GenerateSqlStreamError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'GenerateSqlStreamError'
    this.status = status
  }
}

/**
 * Stream multi-step AI SQL generation via SSE.
 * Resolves on `done`, rejects on `error` / HTTP failure / abort / timeout.
 */
export async function generateSqlStream(
  body: GenerateSqlBody,
  onProgress?: (event: GenerateProgressEvent) => void,
  signal?: AbortSignal
): Promise<GenerateSqlResult> {
  const baseURL = import.meta.env.VITE_API_BASE_URL || ''
  const url = `${baseURL}/api/sqls/generate/stream`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS)

  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId)
      throw new DOMException('Aborted', 'AbortError')
    }
    signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      let message = `Request failed (${response.status})`
      try {
        const payload = (await response.json()) as { message?: string }
        if (payload?.message) message = payload.message
      } catch {
        // ignore body parse errors
      }
      throw new GenerateSqlStreamError(response.status, message)
    }

    if (!response.body) {
      throw new GenerateSqlStreamError(500, 'Empty SSE response body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parsed = parseSseFrames(buffer)
      buffer = parsed.rest

      for (const frame of parsed.frames) {
        if (!frame.trim() || frame.startsWith(':')) continue
        const { event, data } = parseSseFrame(frame)
        if (!data) continue

        let payload: unknown
        try {
          payload = JSON.parse(data)
        } catch {
          continue
        }

        if (event === 'progress') {
          onProgress?.(payload as GenerateProgressEvent)
          continue
        }
        if (event === 'done') {
          return payload as GenerateSqlResult
        }
        if (event === 'error') {
          const err = payload as { status?: number; message?: string }
          throw new GenerateSqlStreamError(
            err.status || 500,
            err.message || 'AI generation failed'
          )
        }
        if (event === 'close') {
          break
        }
      }
    }

    throw new GenerateSqlStreamError(500, 'SSE stream ended without a result')
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

export function reviewSql(body: ReviewSqlBody): Promise<ReviewResult> {
  return apiRequest<ReviewResult>({
    method: 'POST',
    url: '/api/sqls/review',
    data: body,
    timeout: 120_000,
  })
}

/** Self-contained OpenAPI document for a single SQL API. */
export function getSqlOpenApiDoc(id: string): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>({
    method: 'GET',
    url: `/api/sqls/${id}/openapi`,
  })
}
