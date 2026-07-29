import { Router } from '@axiosleo/koapp';
import controller from './connection.controller';
import {
  connectionIdRules,
  connectionListQueryRules,
  createConnectionRules,
  updateConnectionRules
} from './connection.model';

const router = new Router('/connections');

router.post('/', (ctx) => controller.create(ctx), {
  body: { rules: createConnectionRules }
});

router.get('/', (ctx) => controller.list(ctx), {
  query: { rules: connectionListQueryRules }
});

router.get('/{:id}', (ctx) => controller.detail(ctx), {
  params: { rules: connectionIdRules }
});

router.patch('/{:id}', (ctx) => controller.update(ctx), {
  params: { rules: connectionIdRules },
  body: { rules: updateConnectionRules }
});

router.delete('/{:id}', (ctx) => controller.remove(ctx), {
  params: { rules: connectionIdRules }
});

router.post('/{:id}/test', (ctx) => controller.test(ctx), {
  params: { rules: connectionIdRules }
});

export default router;
