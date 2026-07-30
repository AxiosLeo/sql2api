import { Router } from '@axiosleo/koapp';
import controller from './stat.controller';
import {
  statsLogIdRules,
  statsLogsQueryRules,
  statsSummaryQueryRules
} from './stat.model';

const router = new Router('/stats');

router.get('/overview', (ctx) => controller.overview(ctx));

router.get('/summary', (ctx) => controller.summary(ctx), {
  query: { rules: statsSummaryQueryRules }
});

router.get('/logs', (ctx) => controller.logs(ctx), {
  query: { rules: statsLogsQueryRules }
});

router.get('/logs/{:id}', (ctx) => controller.logDetail(ctx), {
  params: { rules: statsLogIdRules }
});

export default router;
