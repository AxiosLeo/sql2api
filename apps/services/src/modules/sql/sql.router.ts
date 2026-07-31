import { Router } from '@axiosleo/koapp';
import controller from './sql.controller';
import {
  createSqlRules,
  generateSqlRules,
  reviewSqlRules,
  sqlIdRules,
  sqlListQueryRules,
  updateSqlRules
} from './sql.model';

const router = new Router('/sqls');

router.post('', (ctx) => controller.create(ctx), {
  body: { rules: createSqlRules }
});

router.post('/generate', (ctx) => controller.generate(ctx), {
  body: { rules: generateSqlRules }
});

router.post('/generate/stream', (ctx) => controller.generateStream(ctx), {
  body: { rules: generateSqlRules }
});

router.post('/review', (ctx) => controller.review(ctx), {
  body: { rules: reviewSqlRules }
});

router.get('', (ctx) => controller.list(ctx), {
  query: { rules: sqlListQueryRules }
});

router.get('/{:id}/openapi', (ctx) => controller.openapiDoc(ctx), {
  params: { rules: sqlIdRules }
});

router.get('/{:id}', (ctx) => controller.detail(ctx), {
  params: { rules: sqlIdRules }
});

router.patch('/{:id}', (ctx) => controller.update(ctx), {
  params: { rules: sqlIdRules },
  body: { rules: updateSqlRules }
});

router.delete('/{:id}', (ctx) => controller.remove(ctx), {
  params: { rules: sqlIdRules }
});

export default router;
