import type { KoaContext } from '@axiosleo/koapp';
import { BaseController } from '../controller';
import type {
  CreateMetaFieldBody,
  CreateMetaTableBody,
  MetaRecordListQuery,
  MetaTableListQuery,
  UpdateMetaFieldBody,
  UpdateMetaTableBody
} from './meta.model';
import {
  toMetaFieldItem,
  toMetaRecordDetailItem,
  toMetaRecordListItem,
  toMetaTableItem
} from './meta.model';
import {
  createMetaField,
  createMetaTable,
  deleteMetaField,
  deleteMetaTable,
  getMetaRecord,
  getMetaTable,
  listMetaFields,
  listMetaRecords,
  listMetaTables,
  updateMetaField,
  updateMetaTable
} from '../../services/meta';
import { getApp } from '../../services/sqlite';
import type { MetaUserFieldType } from '../../types';

function statusFromError(err: unknown): number | null {
  if (!err || typeof err !== 'object') {
    return null;
  }
  const status = (err as { status?: number }).status;
  return typeof status === 'number' ? status : null;
}

export class MetaController extends BaseController {
  async listTables(context: KoaContext) {
    const appId = this.appId(context);
    const query = (context.query || {}) as MetaTableListQuery;
    const page = Number(query.page) || 1;
    const size = Number(query.size) || 20;
    const result = listMetaTables(appId, {
      page,
      size,
      keyword: query.keyword
    });
    this.success({
      list: result.list.map((row) => toMetaTableItem(row)),
      total: result.total,
      page: result.page,
      size: result.size
    });
  }

  async createTable(context: KoaContext) {
    const body = (context.body || {}) as CreateMetaTableBody;
    if (!getApp(body.app_id)) {
      this.error(400, 'Invalid app_id');
    }
    try {
      const record = createMetaTable({
        app_id: body.app_id,
        name: body.name,
        description: body.description
      });
      const detail = getMetaTable(null, record.id)!;
      this.success(toMetaTableItem(detail));
    } catch (err) {
      if (this.isUniqueConstraintError(err)) {
        this.error(409, 'Table name already exists in this app');
      }
      throw err;
    }
  }

  async tableDetail(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const record = getMetaTable(appId, id);
    if (!record) {
      this.error(404, 'Not Found');
    }
    this.success(toMetaTableItem(record!));
  }

  async updateTable(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const body = (context.body || {}) as UpdateMetaTableBody;
    try {
      const record = updateMetaTable(appId, id, body);
      const detail = getMetaTable(null, record.id)!;
      this.success(toMetaTableItem(detail));
    } catch (err) {
      const status = statusFromError(err);
      if (status === 404) {
        this.error(404, 'Not Found');
      }
      if (this.isUniqueConstraintError(err)) {
        this.error(409, 'Table name already exists in this app');
      }
      throw err;
    }
  }

  async removeTable(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    try {
      const ok = deleteMetaTable(appId, id);
      if (!ok) {
        this.error(404, 'Not Found');
      }
      this.success({ id, deleted: true });
    } catch (err) {
      if (statusFromError(err) === 404) {
        this.error(404, 'Not Found');
      }
      throw err;
    }
  }

  async listFields(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    try {
      const fields = listMetaFields(appId, id);
      this.success({ list: fields.map(toMetaFieldItem) });
    } catch (err) {
      if (statusFromError(err) === 404) {
        this.error(404, 'Not Found');
      }
      throw err;
    }
  }

  async createField(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const body = (context.body || {}) as CreateMetaFieldBody;
    try {
      const field = createMetaField(appId, id, {
        name: body.name,
        type: body.type as MetaUserFieldType,
        validator: body.validator,
        config: body.config,
        sort: body.sort
      });
      this.success(toMetaFieldItem(field));
    } catch (err) {
      const status = statusFromError(err);
      if (status === 404) {
        this.error(404, 'Not Found');
      }
      if (status === 400) {
        this.error(400, (err as Error).message);
      }
      if (this.isUniqueConstraintError(err)) {
        this.error(409, 'Field name already exists in this table');
      }
      throw err;
    }
  }

  async updateField(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const body = (context.body || {}) as UpdateMetaFieldBody;
    try {
      const field = updateMetaField(appId, id, {
        name: body.name,
        type: body.type as MetaUserFieldType | undefined,
        validator: body.validator,
        config: body.config,
        sort: body.sort
      });
      this.success(toMetaFieldItem(field));
    } catch (err) {
      const status = statusFromError(err);
      if (status === 404) {
        this.error(404, 'Not Found');
      }
      if (status === 400) {
        this.error(400, (err as Error).message);
      }
      if (this.isUniqueConstraintError(err)) {
        this.error(409, 'Field name already exists in this table');
      }
      throw err;
    }
  }

  async removeField(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    try {
      const ok = deleteMetaField(appId, id);
      if (!ok) {
        this.error(404, 'Not Found');
      }
      this.success({ id, deleted: true });
    } catch (err) {
      const status = statusFromError(err);
      if (status === 404) {
        this.error(404, 'Not Found');
      }
      if (status === 400) {
        this.error(400, (err as Error).message);
      }
      throw err;
    }
  }

  async listRecords(context: KoaContext) {
    const appId = this.appId(context);
    const query = (context.query || {}) as MetaRecordListQuery;
    const page = Number(query.page) || 1;
    const size = Number(query.size) || 20;
    const result = listMetaRecords(appId, {
      page,
      size,
      table_id: query.table_id
    });
    this.success({
      list: result.list.map(toMetaRecordListItem),
      total: result.total,
      page: result.page,
      size: result.size
    });
  }

  async recordDetail(context: KoaContext) {
    const appId = this.appId(context);
    const id = context.params?.id || '';
    const detail = getMetaRecord(appId, id);
    if (!detail) {
      this.error(404, 'Not Found');
    }
    this.success(toMetaRecordDetailItem(detail!));
  }
}

export default new MetaController();
