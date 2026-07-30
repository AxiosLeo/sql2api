import { apiRequest } from '@/lib/api-client'

export type AppStatus = 'active' | 'disabled'

export interface AppItem {
  id: string
  name: string
  description: string
  status: AppStatus
  created_at: string
  updated_at: string
}

export interface AppListData {
  list: AppItem[]
  total: number
  page: number
  size: number
}

export interface AppListQuery {
  page?: number
  size?: number
  keyword?: string
}

export interface CreateAppBody {
  name: string
  description?: string
}

export interface UpdateAppBody {
  name?: string
  description?: string
  status?: AppStatus
}

export interface ApiKeyItem {
  id: string
  app_id: string
  name: string
  prefix: string
  status: AppStatus
  last_used_at: string | null
  created_at: string
}

export interface ApiKeyListData {
  list: ApiKeyItem[]
}

export interface CreateApiKeyBody {
  name?: string
}

export interface CreateApiKeyResult extends ApiKeyItem {
  token: string
}

export function listApps(params: AppListQuery = {}): Promise<AppListData> {
  return apiRequest<AppListData>({
    method: 'GET',
    url: '/api/apps',
    params,
  })
}

export function getApp(id: string): Promise<AppItem> {
  return apiRequest<AppItem>({
    method: 'GET',
    url: `/api/apps/${id}`,
  })
}

export function createApp(body: CreateAppBody): Promise<AppItem> {
  return apiRequest<AppItem>({
    method: 'POST',
    url: '/api/apps',
    data: body,
  })
}

export function updateApp(id: string, body: UpdateAppBody): Promise<AppItem> {
  return apiRequest<AppItem>({
    method: 'PATCH',
    url: `/api/apps/${id}`,
    data: body,
  })
}

export function deleteApp(id: string): Promise<{ id: string; deleted: boolean }> {
  return apiRequest<{ id: string; deleted: boolean }>({
    method: 'DELETE',
    url: `/api/apps/${id}`,
  })
}

export function listAppKeys(appId: string): Promise<ApiKeyListData> {
  return apiRequest<ApiKeyListData>({
    method: 'GET',
    url: `/api/apps/${appId}/keys`,
  })
}

export function createAppKey(
  appId: string,
  body: CreateApiKeyBody = {}
): Promise<CreateApiKeyResult> {
  return apiRequest<CreateApiKeyResult>({
    method: 'POST',
    url: `/api/apps/${appId}/keys`,
    data: body,
  })
}

export function revokeAppKey(
  appId: string,
  keyId: string
): Promise<{ id: string; revoked: boolean }> {
  return apiRequest<{ id: string; revoked: boolean }>({
    method: 'DELETE',
    url: `/api/apps/${appId}/keys/${keyId}`,
  })
}
