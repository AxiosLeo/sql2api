import type { DatasourceType, EntityStatus } from '../../types';
import { DATASOURCE_TYPE_IN_RULE, paginationRules } from '../../types';
import type { ConnectionRecord } from '../../services/sqlite';

export interface ConnectionItem {
  id: string;
  app_id: string;
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
  /** Required unless copy_password_from is provided. */
  password?: string;
  database: string;
  /** Required when creating via admin session (no Bearer app scope). */
  app_id?: string;
  /** When password is omitted, decrypt and reuse this connection's password. */
  copy_password_from?: string;
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
  app_id?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message?: string;
  latency_ms?: number;
}

/** Body for POST /connections/probe — read-only, never writes meta DB. */
export interface ProbeConnectionBody {
  type: DatasourceType;
  host: string;
  port: number;
  username: string;
  /** Required unless connection_id is provided (edit with blank password). */
  password?: string;
  database?: string;
  /** When password is omitted, load credentials from this saved connection. */
  connection_id?: string;
  /** Default: test */
  action?: 'test' | 'databases';
}

export const createConnectionRules = {
  name: 'required|string|max:64',
  type: `required|in:${DATASOURCE_TYPE_IN_RULE}`,
  host: 'required|string',
  port: 'required|integer|min:1|max:65535',
  username: 'required|string',
  password: 'string',
  database: 'required|string',
  app_id: 'string',
  copy_password_from: 'string'
};

export const updateConnectionRules = {
  name: 'string|max:64',
  type: `in:${DATASOURCE_TYPE_IN_RULE}`,
  host: 'string',
  port: 'integer|min:1|max:65535',
  username: 'string',
  password: 'string',
  database: 'string',
  status: 'in:active,disabled'
};

export const probeConnectionRules = {
  type: `required|in:${DATASOURCE_TYPE_IN_RULE}`,
  host: 'required|string',
  port: 'required|integer|min:1|max:65535',
  username: 'required|string',
  password: 'string',
  database: 'string',
  connection_id: 'string',
  action: 'in:test,databases'
};

export const connectionIdRules = {
  id: 'required|string'
};

export const connectionListQueryRules = {
  ...paginationRules,
  app_id: 'string'
};

/** Map a DB record to API response (never expose password_enc). */
export function toConnectionItem(record: ConnectionRecord): ConnectionItem {
  return {
    id: record.id,
    app_id: record.app_id,
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
