import { Router } from '@axiosleo/koapp';
import controller from './meta.controller';
import {
  createMetaFieldRules,
  createMetaTableRules,
  metaFieldIdRules,
  metaRecordIdRules,
  metaRecordListQueryRules,
  metaTableIdRules,
  metaTableListQueryRules,
  updateMetaFieldRules,
  updateMetaTableRules
} from './meta.model';

const router = new Router();

const tables = new Router('/meta/tables');

tables.get('', (ctx) => controller.listTables(ctx), {
  query: { rules: metaTableListQueryRules }
});

tables.post('', (ctx) => controller.createTable(ctx), {
  body: { rules: createMetaTableRules }
});

tables.get('/{:id}', (ctx) => controller.tableDetail(ctx), {
  params: { rules: metaTableIdRules }
});

tables.patch('/{:id}', (ctx) => controller.updateTable(ctx), {
  params: { rules: metaTableIdRules },
  body: { rules: updateMetaTableRules }
});

tables.delete('/{:id}', (ctx) => controller.removeTable(ctx), {
  params: { rules: metaTableIdRules }
});

tables.get('/{:id}/fields', (ctx) => controller.listFields(ctx), {
  params: { rules: metaTableIdRules }
});

tables.post('/{:id}/fields', (ctx) => controller.createField(ctx), {
  params: { rules: metaTableIdRules },
  body: { rules: createMetaFieldRules }
});

router.add(tables);

const fields = new Router('/meta/fields');

fields.patch('/{:id}', (ctx) => controller.updateField(ctx), {
  params: { rules: metaFieldIdRules },
  body: { rules: updateMetaFieldRules }
});

fields.delete('/{:id}', (ctx) => controller.removeField(ctx), {
  params: { rules: metaFieldIdRules }
});

router.add(fields);

const records = new Router('/meta/records');

records.get('', (ctx) => controller.listRecords(ctx), {
  query: { rules: metaRecordListQueryRules }
});

records.get('/{:id}', (ctx) => controller.recordDetail(ctx), {
  params: { rules: metaRecordIdRules }
});

router.add(records);

export default router;
