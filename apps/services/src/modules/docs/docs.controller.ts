import type { KoaContext } from '@axiosleo/koapp';
import { result } from '@axiosleo/koapp';
import { BaseController } from '../controller';
import { buildOpenApiSpec } from '../../services/openapi-spec';
import { resolveApiKey } from '../../services/sqlite';

function resolveServerUrl(context: KoaContext): string {
  const koaReq = context.koa?.request as
    | { origin?: string; protocol?: string; host?: string }
    | undefined;
  if (koaReq?.origin) {
    return koaReq.origin;
  }
  const host =
    (typeof context.headers?.host === 'string' && context.headers.host)
    || koaReq?.host
    || '127.0.0.1:13334';
  const protoHeader = context.headers?.['x-forwarded-proto'];
  const proto =
    (typeof protoHeader === 'string' && protoHeader.split(',')[0].trim())
    || koaReq?.protocol
    || 'http';
  return `${proto}://${host}`;
}

function extractApiKey(context: KoaContext): string | null {
  const header =
    context.headers?.authorization || context.headers?.Authorization;
  if (typeof header === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (match) {
      const token = match[1].trim();
      if (token) {
        return token;
      }
    }
  }

  const query = (context.query || {}) as Record<string, unknown>;
  const fromQuery = query.api_key;
  if (typeof fromQuery === 'string' && fromQuery.trim()) {
    return fromQuery.trim();
  }
  return null;
}

export class DocsController extends BaseController {
  /** Public direct link: raw OpenAPI JSON, Api-Key via Bearer or ?api_key=. */
  async direct(context: KoaContext) {
    const token = extractApiKey(context);
    if (!token) {
      this.error(401, 'Unauthorized');
    }

    const resolved = await resolveApiKey(token!);
    if (!resolved) {
      this.error(401, 'Unauthorized');
    }

    const spec = buildOpenApiSpec({
      appId: resolved!.app_id,
      serverUrl: resolveServerUrl(context)
    });

    result(JSON.stringify(spec, null, 2), 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
  }

  /** Admin session: enveloped OpenAPI JSON, optional ?app_id= filter. */
  async adminSpec(context: KoaContext) {
    const appId = this.appId(context);
    const spec = buildOpenApiSpec({
      appId,
      serverUrl: resolveServerUrl(context)
    });
    this.success(spec);
  }
}

export default new DocsController();
