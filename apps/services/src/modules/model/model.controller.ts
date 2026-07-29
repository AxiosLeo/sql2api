import type { KoaContext } from '@axiosleo/koapp';
import { BaseController } from '../controller';
import type {
  GenerateModelsBody,
  GenerateModelsResult,
  ModelDefinition,
  ModelListQuery,
  TablesResult
} from './model.model';
import { stubModel } from './model.model';
import type { PaginatedResult } from '../../types';

export class ModelController extends BaseController {
  async listTables(_context: KoaContext) {
    const result: TablesResult = {
      tables: [
        { name: 'users', comment: 'Stub users table' },
        { name: 'orders', comment: 'Stub orders table' }
      ]
    };
    this.success(result);
  }

  async generate(context: KoaContext) {
    const connectionId = context.params?.connection_id || 'stub-connection-id';
    const body = (context.body || {}) as GenerateModelsBody;
    const tableNames = body.all
      ? ['users', 'orders']
      : (body.tables || []);

    const result: GenerateModelsResult = {
      generated: tableNames.map((name) => stubModel({
        connection_id: connectionId,
        table_name: name,
        id: `stub-model-${name}`
      })),
      skipped: []
    };
    this.success(result);
  }

  async list(context: KoaContext) {
    const query = (context.query || {}) as ModelListQuery;
    const page = Number(query.page) || 1;
    const size = Number(query.size) || 20;
    const item = stubModel(query.connection_id ? { connection_id: query.connection_id } : {});
    const result: PaginatedResult<ModelDefinition> = {
      list: [item],
      total: 1,
      page,
      size
    };
    this.success(result);
  }

  async detail(context: KoaContext) {
    this.success(stubModel({ id: context.params?.id }));
  }

  async sync(context: KoaContext) {
    this.success(stubModel({
      id: context.params?.id,
      updated_at: new Date().toISOString()
    }));
  }

  async remove(context: KoaContext) {
    this.success({ id: context.params?.id, deleted: true });
  }
}

export default new ModelController();
