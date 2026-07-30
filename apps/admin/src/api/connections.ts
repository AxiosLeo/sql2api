import { apiRequest } from '@/lib/api-client'

export type DatasourceType = 'mysql' | 'postgresql'
export type ConnectionStatus = 'active' | 'disabled'

export interface ConnectionItem {
  id: string
  app_id: string
  name: string
  type: DatasourceType
  host: string
  port: number
  username: string
  database: string
  status: ConnectionStatus
  created_at: string
  updated_at: string
}

export interface ConnectionListData {
  list: ConnectionItem[]
  total: number
  page: number
  size: number
}

export interface ConnectionListQuery {
  page?: number
  size?: number
  keyword?: string
  app_id?: string
}

export interface CreateConnectionBody {
  app_id: string
  name: string
  type: DatasourceType
  host: string
  port: number
  username: string
  password: string
  database: string
}

export interface UpdateConnectionBody {
  name?: string
  type?: DatasourceType
  host?: string
  port?: number
  username?: string
  password?: string
  database?: string
  status?: ConnectionStatus
}

export interface TestConnectionResult {
  ok: boolean
  message?: string
  latency_ms?: number
}

export function listConnections(
  params: ConnectionListQuery = {}
): Promise<ConnectionListData> {
  return apiRequest<ConnectionListData>({
    method: 'GET',
    url: '/api/connections',
    params,
  })
}

export function createConnection(
  body: CreateConnectionBody
): Promise<ConnectionItem> {
  return apiRequest<ConnectionItem>({
    method: 'POST',
    url: '/api/connections',
    data: body,
  })
}

export function updateConnection(
  id: string,
  body: UpdateConnectionBody
): Promise<ConnectionItem> {
  return apiRequest<ConnectionItem>({
    method: 'PATCH',
    url: `/api/connections/${id}`,
    data: body,
  })
}

export function deleteConnection(
  id: string
): Promise<{ id: string; deleted: boolean }> {
  return apiRequest<{ id: string; deleted: boolean }>({
    method: 'DELETE',
    url: `/api/connections/${id}`,
  })
}

export function testConnection(id: string): Promise<TestConnectionResult> {
  return apiRequest<TestConnectionResult>({
    method: 'POST',
    url: `/api/connections/${id}/test`,
  })
}
