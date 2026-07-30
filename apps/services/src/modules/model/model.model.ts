import type { ColumnDefinition } from '../../types';
import { paginationRules } from '../../types';
import type { ModelRecord } from '../../services/sqlite';

export interface ModelDefinition {
  id: string;
  connection_id: string;
  table_name: string;
  comment: string;
  columns: ColumnDefinition[];
  created_at: string;
  updated_at: string;
}

export interface GenerateModelsBody {
  tables?: string[];
  all?: boolean;
}

export interface GenerateModelsResult {
  generated: ModelDefinition[];
  skipped: string[];
}

export interface ModelListQuery {
  page?: number;
  size?: number;
  keyword?: string;
  connection_id?: string;
}

export interface TablesResult {
  tables: { name: string; comment: string }[];
}

export const connectionIdParamRules = {
  connection_id: 'required|string'
};

export const modelIdRules = {
  id: 'required|string'
};

export const generateModelsRules = {
  tables: 'array',
  'tables.*': 'string',
  all: 'boolean'
};

export const modelListQueryRules = {
  ...paginationRules,
  connection_id: 'string',
  app_id: 'string'
};

/** Map a DB record to API response (parse columns_json). */
export function toModelItem(record: ModelRecord): ModelDefinition {
  return {
    id: record.id,
    connection_id: record.connection_id,
    table_name: record.table_name,
    comment: record.comment,
    columns: JSON.parse(record.columns_json || '[]') as ColumnDefinition[],
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}
