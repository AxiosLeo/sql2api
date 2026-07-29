import type { KoaContext } from '@axiosleo/koapp';
import { BaseController } from '../controller';
import type {
  ConnectionListQuery,
  CreateConnectionBody,
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
import { testConnection } from '../../services/datasource';

function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const code = (err as { code?: string }).code || '';
  return code.startsWith('SQLITE_CONSTRAINT');
}

export class ConnectionController extends BaseController {
  async create(context: KoaContext) {
    const appId = this.appId(context);
    const body = context.body as CreateConnectionBody;

    try {
      const record = createConnection({
        app_id: appId,
        name: body.name,
        type: body.type,
        host: body.host,
        port: Number(body.port),
        username: body.username,
        password: body.password,
        database: body.database
      });
      this.success(toConnectionItem(record));
    } catch (err) {
      if (isUniqueConstraintError(err)) {
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
      if (isUniqueConstraintError(err)) {
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
}

export default new ConnectionController();
