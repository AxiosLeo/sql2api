import type { DatasourceType, EntityStatus } from '../../types';
import { paginationRules } from '../../types';
import type { ConnectionRecord } from '../../services/sqlite';

export interface ConnectionItem {
  id: string;
  name: string;
  type: DatasourceType;
  host: string;
  port: number;
  username: string;
  database: string;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateConnectionBody {
  name: string;
  type: DatasourceType;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export interface UpdateConnectionBody {
  name?: string;
  type?: DatasourceType;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  status?: EntityStatus;
}

export interface ConnectionListQuery {
  page?: number;
  size?: number;
  keyword?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message?: string;
  latency_ms?: number;
}

export const createConnectionRules = {
  name: 'required|string|max:64',
  type: 'required|in:mysql,postgresql',
  host: 'required|string',
  port: 'required|integer|min:1|max:65535',
  username: 'required|string',
  password: 'required|string',
  database: 'required|string'
};

export const updateConnectionRules = {
  name: 'string|max:64',
  type: 'in:mysql,postgresql',
  host: 'string',
  port: 'integer|min:1|max:65535',
  username: 'string',
  password: 'string',
  database: 'string',
  status: 'in:active,disabled'
};

export const connectionIdRules = {
  id: 'required|string'
};

export const connectionListQueryRules = {
  ...paginationRules
};

/** Map a DB record to API response (never expose password_enc / app_id). */
export function toConnectionItem(record: ConnectionRecord): ConnectionItem {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    host: record.host,
    port: record.port,
    username: record.username,
    database: record.database,
    status: record.status,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}
