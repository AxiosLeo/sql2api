import type { KoaContext } from '@axiosleo/koapp';
import { BaseController } from '../controller';
import {
  getEnvAIConfig,
  resolveAIConfig,
  type AIOnlineSettings,
  type AIResolvedConfig
} from '../../services/ai';
import {
  deleteSetting,
  encryptPassword,
  getSettingJSON,
  setSettingJSON
} from '../../services/sqlite';
import type {
  TestAiConnectionBody,
  UpdateAiSettingsBody
} from './setting.model';

const AI_SETTINGS_KEY = 'ai';

/** Public ollama shape: never expose the raw key, only whether one is set. */
interface PublicOllamaConfig {
  base_url: string;
  model: string;
  timeout_ms: number;
  api_key_set: boolean;
}

interface PublicAiSettingsResponse {
  source: 'online' | 'env';
  online: {
    provider?: AIOnlineSettings['provider'];
    model_path?: string;
    ollama?: {
      base_url?: string;
      model?: string;
      timeout_ms?: number;
      api_key_set: boolean;
    };
  } | null;
  env: {
    provider: AIResolvedConfig['provider'];
    model_path: string;
    ollama: PublicOllamaConfig;
  };
  effective: {
    provider: AIResolvedConfig['provider'];
    model_path: string;
    ollama: PublicOllamaConfig;
  };
}

function toPublicOllama(ollama: {
  base_url: string;
  model: string;
  timeout_ms: number;
  api_key: string;
}): PublicOllamaConfig {
  return {
    base_url: ollama.base_url,
    model: ollama.model,
    timeout_ms: ollama.timeout_ms,
    api_key_set: Boolean(ollama.api_key && ollama.api_key.trim())
  };
}

function toPublicOnline(
  online: AIOnlineSettings | null | undefined
): PublicAiSettingsResponse['online'] {
  if (!online || typeof online !== 'object') {
    return null;
  }
  return {
    provider: online.provider,
    model_path: online.model_path,
    ollama: online.ollama
      ? {
          base_url: online.ollama.base_url,
          model: online.ollama.model,
          timeout_ms: online.ollama.timeout_ms,
          api_key_set: Boolean(
            online.ollama.api_key && online.ollama.api_key.trim()
          )
        }
      : undefined
  };
}

function buildAiSettingsResponse(
  online: AIOnlineSettings | null
): PublicAiSettingsResponse {
  const env = getEnvAIConfig();
  const effective = resolveAIConfig();
  return {
    source: effective.source,
    online: toPublicOnline(online),
    env: {
      provider: env.provider,
      model_path: env.model_path,
      ollama: toPublicOllama(env.ollama)
    },
    effective: {
      provider: effective.provider,
      model_path: effective.model_path,
      ollama: toPublicOllama(effective.ollama)
    }
  };
}

function buildOllamaAuthHeaders(apiKey: string): Record<string, string> {
  if (!apiKey) {
    return {};
  }
  return { Authorization: `Bearer ${apiKey}` };
}

export class SettingController extends BaseController {
  async getAi(_context: KoaContext) {
    const online = getSettingJSON<AIOnlineSettings>(AI_SETTINGS_KEY);
    this.success(buildAiSettingsResponse(online));
  }

  async updateAi(context: KoaContext) {
    const body = (context.body || {}) as UpdateAiSettingsBody;
    const previous = getSettingJSON<AIOnlineSettings>(AI_SETTINGS_KEY);

    let nextApiKey: string | undefined;
    if (body.ollama && Object.prototype.hasOwnProperty.call(body.ollama, 'api_key')) {
      const incoming = body.ollama.api_key;
      if (typeof incoming === 'string' && incoming.trim()) {
        nextApiKey = encryptPassword(incoming.trim());
      } else {
        // Empty string or whitespace → clear stored key
        nextApiKey = undefined;
      }
    } else {
      // Omitted → keep previous online key
      nextApiKey = previous?.ollama?.api_key;
    }

    const payload: AIOnlineSettings = {
      provider: body.provider,
      model_path:
        typeof body.model_path === 'string' ? body.model_path.trim() : undefined,
      ollama: body.ollama
        ? {
            base_url:
              typeof body.ollama.base_url === 'string'
                ? body.ollama.base_url.trim().replace(/\/$/, '')
                : undefined,
            model:
              typeof body.ollama.model === 'string'
                ? body.ollama.model.trim()
                : undefined,
            timeout_ms:
              typeof body.ollama.timeout_ms === 'number'
                ? body.ollama.timeout_ms
                : undefined,
            api_key: nextApiKey
          }
        : undefined
    };

    // When ollama block is present but api_key was cleared, omit the field entirely
    if (payload.ollama && !payload.ollama.api_key) {
      delete payload.ollama.api_key;
    }

    setSettingJSON(AI_SETTINGS_KEY, payload);
    this.success(buildAiSettingsResponse(payload));
  }

  async resetAi(_context: KoaContext) {
    deleteSetting(AI_SETTINGS_KEY);
    this.success(buildAiSettingsResponse(null));
  }

  async testAi(context: KoaContext) {
    const body = (context.body || {}) as TestAiConnectionBody;
    const effective = resolveAIConfig();
    const base = (
      (typeof body.base_url === 'string' && body.base_url.trim())
      || effective.ollama.base_url
    ).replace(/\/$/, '');

    if (!base) {
      this.error(400, 'Ollama base URL is required');
    }

    const apiKey =
      typeof body.api_key === 'string' && body.api_key.trim()
        ? body.api_key.trim()
        : effective.ollama.api_key;

    const timeoutMs = effective.ollama.timeout_ms || 120000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 15000));
    const headers = buildOllamaAuthHeaders(apiKey);

    try {
      const [versionRes, tagsRes] = await Promise.all([
        fetch(`${base}/api/version`, { signal: controller.signal, headers }),
        fetch(`${base}/api/tags`, { signal: controller.signal, headers })
      ]);

      if (!versionRes.ok) {
        this.error(
          502,
          `Ollama version check failed: HTTP ${versionRes.status}`
        );
      }
      if (!tagsRes.ok) {
        this.error(502, `Ollama tags check failed: HTTP ${tagsRes.status}`);
      }

      const versionBody = (await versionRes.json()) as { version?: string };
      const tagsBody = (await tagsRes.json()) as {
        models?: Array<{ name?: string }>;
      };
      const models = (tagsBody.models || [])
        .map((m) => m.name || '')
        .filter(Boolean)
        .sort();

      this.success({
        version: versionBody.version || '',
        models,
        base_url: base
      });
    } catch (err) {
      // this.success / this.error throw HttpResponse/HttpError — rethrow as-is
      if (err && typeof err === 'object' && 'status' in err) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        this.error(502, 'Ollama connection timed out');
      }
      const message = err instanceof Error ? err.message : String(err);
      let cause = '';
      if (err instanceof Error && 'cause' in err) {
        const c = (err as Error & { cause?: unknown }).cause;
        if (c instanceof Error) {
          cause = c.message;
        }
      }
      this.error(
        502,
        `Ollama connection failed: ${message}${cause ? ` (${cause})` : ''}`
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export default new SettingController();
