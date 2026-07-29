import type { ColumnDefinition } from '../../types';
import { paginationRules } from '../../types';

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
  connection_id: 'string'
};

export function stubModel(overrides: Partial<ModelDefinition> = {}): ModelDefinition {
  const now = new Date().toISOString();
  return {
    id: 'stub-model-id',
    connection_id: 'stub-connection-id',
    table_name: 'users',
    comment: 'Stub users table',
    columns: [
      {
        name: 'id',
        type: 'BIGINT',
        nullable: false,
        default: null,
        comment: 'Primary key',
        is_primary: true,
        is_auto_increment: true
      },
      {
        name: 'name',
        type: 'VARCHAR(64)',
        nullable: false,
        default: null,
        comment: 'Display name',
        is_primary: false,
        is_auto_increment: false
      }
    ],
    created_at: now,
    updated_at: now,
    ...overrides
  };
}
