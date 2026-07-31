import type { AIOnlineSettings, AIProvider } from '../../services/ai';

export interface UpdateAiSettingsBody {
  provider: AIProvider;
  model_path?: string;
  ollama?: {
    base_url?: string;
    model?: string;
    timeout_ms?: number;
  };
}

export interface TestAiConnectionBody {
  base_url?: string;
}

export const updateAiSettingsRules = {
  provider: 'required|in:local,ollama',
  model_path: 'string',
  'ollama.base_url': 'string',
  'ollama.model': 'string',
  'ollama.timeout_ms': 'integer|min:1000'
};

export const testAiConnectionRules = {
  base_url: 'string'
};

export type { AIOnlineSettings };
