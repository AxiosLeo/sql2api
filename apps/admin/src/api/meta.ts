import { apiRequest } from '@/lib/api-client'

export const META_USER_FIELD_TYPES = [
  'text',
  'number',
  'single_select',
  'multi_select',
  'datetime',
  'one_way_link',
  'two_way_link',
  'parent_record',
  'attachment',
] as const

export type MetaUserFieldType = (typeof META_USER_FIELD_TYPES)[number]

export type MetaFieldType =
  | MetaUserFieldType
  | 'created_by'
  | 'updated_by'
  | 'created_at'
  | 'updated_at'

export type MetaTableStatus = 'active' | 'disabled'

export type MetaLinkFilterOp = 'eq' | 'neq' | 'in' | 'contains'

export const META_LINK_FILTER_OPS = [
  'eq',
  'neq',
  'in',
  'contains',
] as const

export interface MetaLinkFilter {
  field_id: string
  op: MetaLinkFilterOp
  value: unknown
}

export interface MetaFieldConfig {
  options?: string[]
  format?: string
  target_table_id?: string
  reverse_field_id?: string
  multiple?: boolean
  link_scope?: 'all' | 'filter'
  filters?: MetaLinkFilter[]
}

export interface MetaTableItem {
  id: string
  app_id: string
  name: string
  description: string
  status: MetaTableStatus
  field_count: number
  record_count: number
  created_at: string
  updated_at: string
}

export interface MetaFieldItem {
  id: string
  table_id: string
  name: string
  type: MetaFieldType
  validator: string
  config: MetaFieldConfig
  is_system: boolean
  sort: number
  created_at: string
  updated_at: string
}

export interface MetaRecordListItem {
  record_id: string
  app_id: string
  table_id: string
  created_by: string
  updated_by: string
  created_at: number
  updated_at: number
}

export interface MetaRecordDetailItem extends MetaRecordListItem {
  data: Record<string, unknown>
  fields: MetaFieldItem[]
}

export interface MetaTableListData {
  list: MetaTableItem[]
  total: number
  page: number
  size: number
}

export interface MetaRecordListData {
  list: MetaRecordListItem[]
  total: number
  page: number
  size: number
}

export interface MetaTableListQuery {
  page?: number
  size?: number
  keyword?: string
  app_id?: string
}

export interface MetaRecordListQuery {
  page?: number
  size?: number
  table_id?: string
  app_id?: string
}

export interface CreateMetaTableBody {
  app_id: string
  name: string
  description?: string
}

export interface UpdateMetaTableBody {
  name?: string
  description?: string
  status?: MetaTableStatus
}

export interface CreateMetaFieldBody {
  name: string
  type: MetaUserFieldType
  validator?: string
  config?: MetaFieldConfig
  sort?: number
}

export interface UpdateMetaFieldBody {
  name?: string
  type?: MetaUserFieldType
  validator?: string
  config?: MetaFieldConfig
  sort?: number
}

export function listMetaTables(
  params: MetaTableListQuery = {}
): Promise<MetaTableListData> {
  return apiRequest<MetaTableListData>({
    method: 'GET',
    url: '/api/meta/tables',
    params,
  })
}

export function getMetaTable(id: string): Promise<MetaTableItem> {
  return apiRequest<MetaTableItem>({
    method: 'GET',
    url: `/api/meta/tables/${id}`,
  })
}

export function createMetaTable(
  body: CreateMetaTableBody
): Promise<MetaTableItem> {
  return apiRequest<MetaTableItem>({
    method: 'POST',
    url: '/api/meta/tables',
    data: body,
  })
}

export function updateMetaTable(
  id: string,
  body: UpdateMetaTableBody
): Promise<MetaTableItem> {
  return apiRequest<MetaTableItem>({
    method: 'PATCH',
    url: `/api/meta/tables/${id}`,
    data: body,
  })
}

export function deleteMetaTable(
  id: string
): Promise<{ id: string; deleted: boolean }> {
  return apiRequest<{ id: string; deleted: boolean }>({
    method: 'DELETE',
    url: `/api/meta/tables/${id}`,
  })
}

export function listMetaFields(
  tableId: string
): Promise<{ list: MetaFieldItem[] }> {
  return apiRequest<{ list: MetaFieldItem[] }>({
    method: 'GET',
    url: `/api/meta/tables/${tableId}/fields`,
  })
}

export function createMetaField(
  tableId: string,
  body: CreateMetaFieldBody
): Promise<MetaFieldItem> {
  return apiRequest<MetaFieldItem>({
    method: 'POST',
    url: `/api/meta/tables/${tableId}/fields`,
    data: body,
  })
}

export function updateMetaField(
  id: string,
  body: UpdateMetaFieldBody
): Promise<MetaFieldItem> {
  return apiRequest<MetaFieldItem>({
    method: 'PATCH',
    url: `/api/meta/fields/${id}`,
    data: body,
  })
}

export function deleteMetaField(
  id: string
): Promise<{ id: string; deleted: boolean }> {
  return apiRequest<{ id: string; deleted: boolean }>({
    method: 'DELETE',
    url: `/api/meta/fields/${id}`,
  })
}

export function listMetaRecords(
  params: MetaRecordListQuery = {}
): Promise<MetaRecordListData> {
  return apiRequest<MetaRecordListData>({
    method: 'GET',
    url: '/api/meta/records',
    params,
  })
}

export function getMetaRecord(id: string): Promise<MetaRecordDetailItem> {
  return apiRequest<MetaRecordDetailItem>({
    method: 'GET',
    url: `/api/meta/records/${id}`,
  })
}

export const META_FIELD_TYPE_LABELS: Record<MetaFieldType, string> = {
  text: 'Text',
  number: 'Number',
  single_select: 'Single Select',
  multi_select: 'Multi Select',
  datetime: 'Date/Time',
  created_by: 'Creator',
  updated_by: 'Modifier',
  created_at: 'Created Time',
  updated_at: 'Updated Time',
  one_way_link: 'One-way Link',
  two_way_link: 'Two-way Link',
  parent_record: 'Parent Record',
  attachment: 'Attachment',
}
