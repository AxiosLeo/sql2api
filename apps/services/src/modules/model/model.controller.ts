import type { KoaContext } from '@axiosleo/koapp';
import { BaseController } from '../controller';
import type {
  GenerateModelsBody,
  ModelListQuery
} from './model.model';
import { toModelItem } from './model.model';
import {
  deleteModel,
  getConnectionConfig,
  getModel,
  listModels,
  upsertModel
} from '../../services/sqlite';
import { describeTables, listTables } from '../../services/datasource';

export class ModelController extends BaseController {
  async listTables(context: KoaContext) {
    const appId = this.appId(context);
    const connectionId = context.params?.connection_id || '';
    const config = getConnectionConfig(appId, connectionId);
    if (!config) {
      this.error(404, 'Not Found');
    }
    const tables = await listTables(config!);
    this.success({ tables });
  }

  async generate(context: KoaContext) {
    const appId = this.appId(context);
    const connectionId = context.params?.connection_id || '';
    const body = (context.body || {}) as GenerateModelsBody;

    const hasTables = Array.isArray(body.tables) && body.tables.length > 0;
    if (!body.all && !hasTables) {
      this.error(400, 'Either "all" or non-empty "tables" is required');
    }

    const config = getConnectionConfig(appId, connectionId);
    if (!config) {
      this.error(404, 'Not Found');
    }

    let tableNames: string[];
    if (body.all) {
      const tables = await listTables(config!);
      tableNames = tables.map((t) => t.name);
    } else {
      tableNames = body.tables || [];
    }

    if (tableNames.length === 0) {
      this.success({ generated: [], skipped: [] });
    }

    const described = await describeTables(config!, tableNames);
    const generated = [];
    const skipped: string[] = [];

    for (const name of tableNames) {
      const info = described[name];
      if (!info) {
        skipped.push(name);
        continue;
      }
      const record = upsertModel({
        app_id: appId,
        connection_id: connectionId,
        table_name: name,
        comment: info.comment || '',
        columns: info.columns
      });
      generated.push(toModelItem(record));
    }

    this.success({ generated, skipped });
  }

  async list(context: KoaContext) {
    const appId = this.appId(context);
    const query = (context.query || {}) as ModelListQuery;
    const page = Number(query.page) || 1;
    const size = Number(query.size) || 20;
    const result = listModels(appId, {
      page,
      size,
      keyword: query.keyword,
      connection_id: query.connection_id
    });
    this.success({
      list: result.list.map(toModelItem),
      total: result.total,
      page: result.page,
      size: result.size
    });
  }

  async detail(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const record = getModel(appId, id);
    if (!record) {
      this.error(404, 'Not Found');
    }
    this.success(toModelItem(record!));
  }

  async sync(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const record = getModel(appId, id);
    if (!record) {
      this.error(404, 'Not Found');
    }

    const config = getConnectionConfig(appId, record!.connection_id);
    if (!config) {
      this.error(404, 'Not Found');
    }

    const described = await describeTables(config!, [record!.table_name]);
    const info = described[record!.table_name];
    if (!info) {
      this.error(404, 'Table Not Found');
    }

    const updated = upsertModel({
      app_id: appId,
      connection_id: record!.connection_id,
      table_name: record!.table_name,
      comment: info!.comment || '',
      columns: info!.columns
    });
    this.success(toModelItem(updated));
  }

  async remove(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const ok = deleteModel(appId, id);
    if (!ok) {
      this.error(404, 'Not Found');
    }
    this.success({ id, deleted: true });
  }
}

export default new ModelController();
