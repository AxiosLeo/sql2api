import { Router, error, success } from '@axiosleo/koapp';
import { authMiddleware } from '../middlewares/auth';
import connectionRouter from './connection/connection.router';
import modelRouter from './model/model.router';
import sqlRouter from './sql/sql.router';
import invokeRouter from './invoke/invoke.router';

const defaultHandler = {
  method: 'any',
  handlers: [async () => {
    error(404, 'Not Found');
  }]
};

const root = new Router('/api', {
  ...defaultHandler,
  middlewares: [authMiddleware]
});

// Health check — mounted without auth by registering before auth-scoped routes
// via a sibling router that shares the /api prefix.
const publicRoot = new Router('/api');
publicRoot.get('/health', async () => {
  success({ status: 'ok' });
});

root.add(connectionRouter);
root.add(modelRouter);
root.add(sqlRouter);
root.add(invokeRouter);
root.new('/***', defaultHandler);

export default [publicRoot, root];
