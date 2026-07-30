import { apiRequest } from '@/lib/api-client'

export interface ColumnDefinition {
  name: string
  type: string
  nullable: boolean
  default: string | null
  comment: string
  is_primary: boolean
  is_auto_increment: boolean
}

export interface ModelItem {
  id: string
  app_id: string
  connection_id: string
  table_name: string
  comment: string
  columns: ColumnDefinition[]
  created_at: string
  updated_at: string
}

export interface ModelListData {
  list: ModelItem[]
  total: number
  page: number
  size: number
}

export interface ModelListQuery {
  page?: number
  size?: number
  keyword?: string
  connection_id?: string
  app_id?: string
}

export interface TableInfo {
  name: string
  comment: string
}

export interface GenerateModelsBody {
  tables?: string[]
  all?: boolean
}

export interface GenerateModelsResult {
  generated: ModelItem[]
  skipped: string[]
}

export function listModels(
  params: ModelListQuery = {}
): Promise<ModelListData> {
  return apiRequest<ModelListData>({
    method: 'GET',
    url: '/api/models',
    params,
  })
}

export function listConnectionTables(
  connectionId: string
): Promise<{ tables: TableInfo[] }> {
  return apiRequest<{ tables: TableInfo[] }>({
    method: 'GET',
    url: `/api/connections/${connectionId}/tables`,
  })
}

export function generateModels(
  connectionId: string,
  body: GenerateModelsBody
): Promise<GenerateModelsResult> {
  return apiRequest<GenerateModelsResult>({
    method: 'POST',
    url: `/api/connections/${connectionId}/models/generate`,
    data: body,
  })
}

export function syncModel(id: string): Promise<ModelItem> {
  return apiRequest<ModelItem>({
    method: 'POST',
    url: `/api/models/${id}/sync`,
  })
}

export function deleteModel(
  id: string
): Promise<{ id: string; deleted: boolean }> {
  return apiRequest<{ id: string; deleted: boolean }>({
    method: 'DELETE',
    url: `/api/models/${id}`,
  })
}
