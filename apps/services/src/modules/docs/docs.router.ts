import { Router } from '@axiosleo/koapp';
import controller from './docs.controller';

/** Root-level direct link: GET /openapi.json (Api-Key auth inside handler). */
export const openApiDirectRouter = new Router('');
openApiDirectRouter.get('/openapi.json', (ctx) => controller.direct(ctx));

/** Admin session: GET /api/openapi.json */
export const openApiAdminRouter = new Router('');
openApiAdminRouter.get('/openapi.json', (ctx) => controller.adminSpec(ctx));
