import { Router } from '@axiosleo/koapp';
import controller from './connection.controller';
import {
  connectionIdRules,
  connectionListQueryRules,
  createConnectionRules,
  probeConnectionRules,
  updateConnectionRules
} from './connection.model';

const router = new Router('/connections');

router.post('', (ctx) => controller.create(ctx), {
  body: { rules: createConnectionRules }
});

router.get('', (ctx) => controller.list(ctx), {
  query: { rules: connectionListQueryRules }
});

/** Must be registered before /{:id} so "probe" is not captured as an id. */
router.post('/probe', (ctx) => controller.probe(ctx), {
  body: { rules: probeConnectionRules }
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
