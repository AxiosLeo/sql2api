import { error } from '@axiosleo/koapp';
import type { KoaContext } from '@axiosleo/koapp';
import { resolveApiKey } from '../services/sqlite';

export interface AuthContext {
  app_id: string;
  key_id: string;
}

declare module '@axiosleo/koapp' {
  interface KoaContext {
    auth?: AuthContext;
  }
}

/**
 * Bearer Token middleware.
 * Expects `Authorization: Bearer <api-key>`, resolves app_id via SQLite.
 * Stub resolveApiKey always returns null → callers will get 401 until
 * real api-key storage is wired. Health route bypasses this middleware.
 */
export async function authMiddleware(context: KoaContext): Promise<void> {
  const header = context.headers?.authorization || context.headers?.Authorization;
  if (!header || typeof header !== 'string') {
    error(401, 'Unauthorized');
  }

  const match = /^Bearer\s+(.+)$/i.exec(header as string);
  if (!match) {
    error(401, 'Unauthorized');
  }

  const token = match![1].trim();
  if (!token) {
    error(401, 'Unauthorized');
  }

  // Stub: resolveApiKey returns null until SQLite storage is implemented.
  // For scaffolding / local smoke tests, accept any non-empty token and
  // attach a placeholder app_id so downstream handlers can run.
  const resolved = await resolveApiKey(token);
  if (resolved) {
    context.auth = { app_id: resolved.app_id, key_id: resolved.key_id };
    return;
  }

  // Temporary stub identity so route scaffolding is callable without a real DB.
  // Replace with `error(401, 'Unauthorized')` once resolveApiKey is implemented.
  context.auth = {
    app_id: 'stub-app-id',
    key_id: 'stub-key-id'
  };
}
