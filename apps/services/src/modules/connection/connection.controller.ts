import type { KoaContext } from '@axiosleo/koapp';
import { BaseController } from '../controller';
import type {
  ConnectionListQuery,
  CreateConnectionBody,
  ProbeConnectionBody,
  UpdateConnectionBody
} from './connection.model';
import { toConnectionItem } from './connection.model';
import {
  createConnection,
  deleteConnection,
  getConnection,
  getConnectionConfig,
  listConnections,
  updateConnection
} from '../../services/sqlite';
import {
  listDatabases,
  testConnection,
  type DatasourceConfig
} from '../../services/datasource';

export class ConnectionController extends BaseController {
  async create(context: KoaContext) {
    const scope = this.appId(context);
    const body = context.body as CreateConnectionBody;

    let appId = scope;
    if (this.isAdmin(context)) {
      if (!body.app_id) {
        this.error(400, 'app_id is required');
      }
      appId = body.app_id!;
    }
    if (!appId) {
      this.error(401, 'Unauthorized');
    }

    const password = (body.password || '').trim();
    let resolvedPassword = password;
    if (!resolvedPassword) {
      if (!body.copy_password_from) {
        this.error(400, 'password is required when copy_password_from is omitted');
      }
      const stored = getConnectionConfig(appId, body.copy_password_from!);
      if (!stored) {
        this.error(404, 'Source connection not found');
      }
      resolvedPassword = stored!.password;
    }

    try {
      const record = createConnection({
        app_id: appId!,
        name: body.name,
        type: body.type,
        host: body.host,
        port: Number(body.port),
        username: body.username,
        password: resolvedPassword,
        database: body.database
      });
      this.success(toConnectionItem(record));
    } catch (err) {
      if (this.isUniqueConstraintError(err)) {
        this.failed({ name: body.name }, '409;Data Already Exists', 409);
      }
      throw err;
    }
  }

  async list(context: KoaContext) {
    const appId = this.appId(context);
    const query = (context.query || {}) as ConnectionListQuery;
    const page = Number(query.page) || 1;
    const size = Number(query.size) || 20;
    const result = listConnections(appId, {
      page,
      size,
      keyword: query.keyword
    });
    this.success({
      list: result.list.map(toConnectionItem),
      total: result.total,
      page: result.page,
      size: result.size
    });
  }

  async detail(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const record = getConnection(appId, id);
    if (!record) {
      this.error(404, 'Not Found');
    }
    this.success(toConnectionItem(record!));
  }

  async update(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const body = (context.body || {}) as UpdateConnectionBody;

    try {
      const record = updateConnection(appId, id, {
        ...body,
        port: body.port !== undefined ? Number(body.port) : undefined
      });
      if (!record) {
        this.error(404, 'Not Found');
      }
      this.success(toConnectionItem(record!));
    } catch (err) {
      if (this.isUniqueConstraintError(err)) {
        this.failed({ name: body.name }, '409;Data Already Exists', 409);
      }
      throw err;
    }
  }

  async remove(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const ok = deleteConnection(appId, id);
    if (!ok) {
      this.error(404, 'Not Found');
    }
    this.success({ id, deleted: true });
  }

  async test(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const config = getConnectionConfig(appId, id);
    if (!config) {
      this.error(404, 'Not Found');
    }
    const result = await testConnection(config!);
    this.success(result);
  }

  /**
   * Read-only probe using form credentials (or stored password via connection_id).
   * Never creates / updates connection records.
   */
  async probe(context: KoaContext) {
    const appId = this.appId(context);
    const body = (context.body || {}) as ProbeConnectionBody;
    const action = body.action || 'test';
    const password = (body.password || '').trim();

    let resolvedPassword = password;
    if (!resolvedPassword) {
      if (!body.connection_id) {
        this.error(400, 'password is required when connection_id is omitted');
      }
      const stored = getConnectionConfig(appId, body.connection_id!);
      if (!stored) {
        this.error(404, 'Connection not found');
      }
      resolvedPassword = stored!.password;
    }

    const config: DatasourceConfig = {
      type: body.type,
      host: body.host,
      port: Number(body.port),
      username: body.username,
      password: resolvedPassword,
      database: body.database || ''
    };

    if (action === 'databases') {
      const result = await listDatabases(config);
      this.success(result);
      return;
    }

    const result = await testConnection(config);
    this.success(result);
  }
}

export default new ConnectionController();
