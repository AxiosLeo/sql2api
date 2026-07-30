import { Router, error, success } from '@axiosleo/koapp';
import { authMiddleware } from '../middlewares/auth';
import { adminAuthMiddleware } from '../middlewares/admin-auth';
import adminRouter from './admin/admin.router';
import appRouter from './app/app.router';
import connectionRouter from './connection/connection.router';
import invokeRouter from './invoke/invoke.router';
import modelRouter from './model/model.router';
import sqlRouter from './sql/sql.router';

const defaultHandler = {
  method: 'any',
  handlers: [async () => {
    error(404, 'Not Found');
  }]
};

/** External OpenAPI surface — Bearer Api-Key, scoped by app_id. */
const root = new Router('/openapi', {
  ...defaultHandler,
  middlewares: [authMiddleware]
});

root.add(connectionRouter);
root.add(modelRouter);
root.add(sqlRouter);
root.add(invokeRouter);
root.new('/***', defaultHandler);

/** Admin console API — session cookie auth. */
const adminApi = new Router('/api', {
  ...defaultHandler
});

// Public admin routes (login / logout / profile)
adminApi.add(adminRouter);

// Authenticated admin routes
const logged = new Router('', { middlewares: [adminAuthMiddleware] });
logged.add(appRouter);
logged.add(connectionRouter);
logged.add(modelRouter);
logged.add(sqlRouter);
logged.add(invokeRouter);
adminApi.add(logged);

/** Public health under /api (no auth). */
const publicRoot = new Router('/api');
publicRoot.get('/health', async () => {
  success({ status: 'ok' });
});

export default [publicRoot, root, adminApi];
