import type { KoaContext } from '@axiosleo/koapp';
import { BaseController } from '../controller';
import type {
  ConnectionItem,
  ConnectionListQuery,
  CreateConnectionBody,
  TestConnectionResult,
  UpdateConnectionBody
} from './connection.model';
import { stubConnection } from './connection.model';
import type { PaginatedResult } from '../../types';

export class ConnectionController extends BaseController {
  async create(context: KoaContext) {
    const body = context.body as CreateConnectionBody;
    const item = stubConnection({
      name: body.name,
      type: body.type,
      host: body.host,
      port: body.port,
      username: body.username,
      database: body.database
    });
    this.success(item);
  }

  async list(context: KoaContext) {
    const query = (context.query || {}) as ConnectionListQuery;
    const page = Number(query.page) || 1;
    const size = Number(query.size) || 20;
    const result: PaginatedResult<ConnectionItem> = {
      list: [stubConnection()],
      total: 1,
      page,
      size
    };
    this.success(result);
  }

  async detail(context: KoaContext) {
    this.success(stubConnection({ id: context.params?.id }));
  }

  async update(context: KoaContext) {
    const body = (context.body || {}) as UpdateConnectionBody;
    const { password: _password, ...rest } = body;
    this.success(stubConnection({
      id: context.params?.id,
      ...rest
    }));
  }

  async remove(context: KoaContext) {
    this.success({ id: context.params?.id, deleted: true });
  }

  async test(_context: KoaContext) {
    const result: TestConnectionResult = {
      ok: true,
      message: 'Stub: connection not actually tested',
      latency_ms: 0
    };
    this.success(result);
  }
}

export default new ConnectionController();
