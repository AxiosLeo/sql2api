import type { MetaFieldConfig, MetaFieldType, MetaTableStatus } from '../../types';
import { paginationRules, META_USER_FIELD_TYPE_IN_RULE } from '../../types';
import type {
  MetaFieldRecord,
  MetaRecordDetail,
  MetaRecordIndexRecord,
  MetaTableListItem,
  MetaTableRecord
} from '../../services/meta';
import { parseMetaFieldConfig } from '../../services/meta';

export interface MetaTableItem {
  id: string;
  app_id: string;
  name: string;
  description: string;
  status: MetaTableStatus;
  field_count: number;
  record_count: number;
  created_at: string;
  updated_at: string;
}

export interface MetaFieldItem {
  id: string;
  table_id: string;
  name: string;
  type: MetaFieldType;
  validator: string;
  config: MetaFieldConfig;
  is_system: boolean;
  sort: number;
  created_at: string;
  updated_at: string;
}

export interface MetaRecordListItem {
  record_id: string;
  app_id: string;
  table_id: string;
  created_by: string;
  updated_by: string;
  created_at: number;
  updated_at: number;
}

export interface MetaRecordDetailItem extends MetaRecordListItem {
  data: Record<string, unknown>;
  fields: MetaFieldItem[];
}

export interface MetaTableListQuery {
  page?: number;
  size?: number;
  keyword?: string;
  app_id?: string;
}

export interface MetaRecordListQuery {
  page?: number;
  size?: number;
  table_id?: string;
  app_id?: string;
}

export interface CreateMetaTableBody {
  app_id: string;
  name: string;
  description?: string;
}

export interface UpdateMetaTableBody {
  name?: string;
  description?: string;
  status?: MetaTableStatus;
}

export interface CreateMetaFieldBody {
  name: string;
  type: string;
  validator?: string;
  config?: MetaFieldConfig;
  sort?: number;
}

export interface UpdateMetaFieldBody {
  name?: string;
  type?: string;
  validator?: string;
  config?: MetaFieldConfig;
  sort?: number;
}

export const metaTableIdRules = {
  id: 'required|string'
};

export const metaFieldIdRules = {
  id: 'required|string'
};

export const metaRecordIdRules = {
  id: 'required|string'
};

export const metaTableListQueryRules = {
  ...paginationRules,
  app_id: 'string'
};

export const metaRecordListQueryRules = {
  ...paginationRules,
  app_id: 'string',
  table_id: 'string'
};

export const createMetaTableRules = {
  app_id: 'required|string',
  name: 'required|string|max:128',
  description: 'string|max:1024'
};

export const updateMetaTableRules = {
  name: 'string|max:128',
  description: 'string|max:1024',
  status: 'in:active,disabled'
};

export const createMetaFieldRules = {
  name: 'required|string|max:128',
  type: `required|string|in:${META_USER_FIELD_TYPE_IN_RULE}`,
  validator: 'string|max:512',
  config: 'object',
  sort: 'integer'
};

export const updateMetaFieldRules = {
  name: 'string|max:128',
  type: `string|in:${META_USER_FIELD_TYPE_IN_RULE}`,
  validator: 'string|max:512',
  config: 'object',
  sort: 'integer'
};

export function toMetaTableItem(
  record: MetaTableListItem | MetaTableRecord,
  counts?: { field_count?: number; record_count?: number }
): MetaTableItem {
  const withCounts = record as MetaTableListItem;
  return {
    id: record.id,
    app_id: record.app_id,
    name: record.name,
    description: record.description,
    status: record.status,
    field_count:
      counts?.field_count ??
      (typeof withCounts.field_count === 'number' ? withCounts.field_count : 0),
    record_count:
      counts?.record_count ??
      (typeof withCounts.record_count === 'number' ? withCounts.record_count : 0),
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

export function toMetaFieldItem(record: MetaFieldRecord): MetaFieldItem {
  return {
    id: record.id,
    table_id: record.table_id,
    name: record.name,
    type: record.type,
    validator: record.validator,
    config: parseMetaFieldConfig(record.config_json),
    is_system: !!record.is_system,
    sort: record.sort,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

export function toMetaRecordListItem(
  record: MetaRecordIndexRecord
): MetaRecordListItem {
  return {
    record_id: record.record_id,
    app_id: record.app_id,
    table_id: record.table_id,
    created_by: record.created_by,
    updated_by: record.updated_by,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

export function toMetaRecordDetailItem(
  detail: MetaRecordDetail
): MetaRecordDetailItem {
  return {
    record_id: detail.record_id,
    app_id: detail.app_id,
    table_id: detail.table_id,
    created_by: detail.created_by,
    updated_by: detail.updated_by,
    created_at: detail.created_at,
    updated_at: detail.updated_at,
    data: detail.data,
    fields: detail.fields.map((f) => ({
      id: f.id,
      table_id: detail.table_id,
      name: f.name,
      type: f.type,
      validator: f.validator,
      config: f.config,
      is_system: f.is_system,
      sort: f.sort,
      created_at: '',
      updated_at: ''
    }))
  };
}
