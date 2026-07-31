import type { AIOnlineSettings, AIProvider } from '../../services/ai';

export interface UpdateAiSettingsBody {
  provider: AIProvider;
  model_path?: string;
  ollama?: {
    base_url?: string;
    model?: string;
    timeout_ms?: number;
    /**
     * Omit = keep existing online key;
     * empty string = clear;
     * non-empty = replace.
     */
    api_key?: string;
  };
}

export interface TestAiConnectionBody {
  base_url?: string;
  api_key?: string;
}

export const updateAiSettingsRules = {
  provider: 'required|in:local,ollama',
  model_path: 'string',
  'ollama.base_url': 'string',
  'ollama.model': 'string',
  'ollama.timeout_ms': 'integer|min:1000',
  'ollama.api_key': 'string'
};

export const testAiConnectionRules = {
  base_url: 'string',
  api_key: 'string'
};

export type { AIOnlineSettings };
