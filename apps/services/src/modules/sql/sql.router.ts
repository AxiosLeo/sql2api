import { Router } from '@axiosleo/koapp';
import controller from './sql.controller';
import {
  applyReviewRules,
  createSqlRules,
  generateMockRules,
  generateNameRules,
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

router.post('/generate-name', (ctx) => controller.generateName(ctx), {
  body: { rules: generateNameRules }
});

router.post('/generate-mock', (ctx) => controller.generateMock(ctx), {
  body: { rules: generateMockRules }
});

router.post('/review', (ctx) => controller.review(ctx), {
  body: { rules: reviewSqlRules }
});

router.post('/apply-review', (ctx) => controller.applyReview(ctx), {
  body: { rules: applyReviewRules }
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
