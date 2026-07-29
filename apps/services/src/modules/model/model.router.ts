import { Router } from '@axiosleo/koapp';
import controller from './model.controller';
import {
  connectionIdParamRules,
  generateModelsRules,
  modelIdRules,
  modelListQueryRules
} from './model.model';

const router = new Router();

// Nested under /connections/{:connection_id}
const connectionScoped = new Router('/connections/{:connection_id}');

connectionScoped.get('/tables', (ctx) => controller.listTables(ctx), {
  params: { rules: connectionIdParamRules }
});

connectionScoped.post('/models/generate', (ctx) => controller.generate(ctx), {
  params: { rules: connectionIdParamRules },
  body: { rules: generateModelsRules }
});

router.add(connectionScoped);

// Top-level /models
const models = new Router('/models');

models.get('', (ctx) => controller.list(ctx), {
  query: { rules: modelListQueryRules }
});

models.get('/{:id}', (ctx) => controller.detail(ctx), {
  params: { rules: modelIdRules }
});

models.post('/{:id}/sync', (ctx) => controller.sync(ctx), {
  params: { rules: modelIdRules }
});

models.delete('/{:id}', (ctx) => controller.remove(ctx), {
  params: { rules: modelIdRules }
});

router.add(models);

export default router;
