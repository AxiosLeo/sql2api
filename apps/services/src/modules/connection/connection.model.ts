import type { DatasourceType, EntityStatus } from '../../types';
import { paginationRules } from '../../types';

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

export function stubConnection(overrides: Partial<ConnectionItem> = {}): ConnectionItem {
  const now = new Date().toISOString();
  return {
    id: 'stub-connection-id',
    name: 'stub-connection',
    type: 'mysql',
    host: '127.0.0.1',
    port: 3306,
    username: 'root',
    database: 'demo',
    status: 'active',
    created_at: now,
    updated_at: now,
    ...overrides
  };
}
