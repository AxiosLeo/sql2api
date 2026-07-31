import { Router } from '@axiosleo/koapp';
import controller from './setting.controller';
import {
  testAiConnectionRules,
  updateAiSettingsRules
} from './setting.model';

const router = new Router('/settings');

router.get('/ai', (ctx) => controller.getAi(ctx));

router.put('/ai', (ctx) => controller.updateAi(ctx), {
  body: { rules: updateAiSettingsRules }
});

router.delete('/ai', (ctx) => controller.resetAi(ctx));

router.post('/ai/test', (ctx) => controller.testAi(ctx), {
  body: { rules: testAiConnectionRules }
});

export default router;
