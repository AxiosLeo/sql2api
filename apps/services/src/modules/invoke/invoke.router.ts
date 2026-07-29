import { Router } from '@axiosleo/koapp';
import controller from './invoke.controller';

const router = new Router('/invoke');

router.any('/{:uuid}', (ctx) => controller.invoke(ctx), {
  params: {
    rules: {
      uuid: 'required|string'
    }
  }
});

export default router;
