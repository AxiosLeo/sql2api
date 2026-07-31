import type { KoaContext } from '@axiosleo/koapp';
import { BaseController } from '../controller';
import {
  getEnvAIConfig,
  resolveAIConfig,
  type AIOnlineSettings
} from '../../services/ai';
import {
  deleteSetting,
  getSettingJSON,
  setSettingJSON
} from '../../services/sqlite';
import type {
  TestAiConnectionBody,
  UpdateAiSettingsBody
} from './setting.model';

const AI_SETTINGS_KEY = 'ai';

export class SettingController extends BaseController {
  async getAi(_context: KoaContext) {
    const env = getEnvAIConfig();
    const online = getSettingJSON<AIOnlineSettings>(AI_SETTINGS_KEY);
    const effective = resolveAIConfig();
    this.success({
      source: effective.source,
      online,
      env,
      effective: {
        provider: effective.provider,
        model_path: effective.model_path,
        ollama: effective.ollama
      }
    });
  }

  async updateAi(context: KoaContext) {
    const body = (context.body || {}) as UpdateAiSettingsBody;
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
                : undefined
          }
        : undefined
    };

    setSettingJSON(AI_SETTINGS_KEY, payload);
    const effective = resolveAIConfig();
    this.success({
      source: effective.source,
      online: payload,
      env: getEnvAIConfig(),
      effective: {
        provider: effective.provider,
        model_path: effective.model_path,
        ollama: effective.ollama
      }
    });
  }

  async resetAi(_context: KoaContext) {
    deleteSetting(AI_SETTINGS_KEY);
    const effective = resolveAIConfig();
    this.success({
      source: effective.source,
      online: null,
      env: getEnvAIConfig(),
      effective: {
        provider: effective.provider,
        model_path: effective.model_path,
        ollama: effective.ollama
      }
    });
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

    const timeoutMs = effective.ollama.timeout_ms || 120000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 15000));

    try {
      const [versionRes, tagsRes] = await Promise.all([
        fetch(`${base}/api/version`, { signal: controller.signal }),
        fetch(`${base}/api/tags`, { signal: controller.signal })
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
      const cause =
        err instanceof Error && err.cause instanceof Error
          ? err.cause.message
          : '';
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
