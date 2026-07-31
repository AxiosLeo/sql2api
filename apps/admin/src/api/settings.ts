import { apiRequest } from '@/lib/api-client'

export type AIProvider = 'local' | 'ollama'

export interface AIOllamaConfig {
  base_url: string
  model: string
  timeout_ms: number
}

export interface AIOnlineSettings {
  provider?: AIProvider
  model_path?: string
  ollama?: {
    base_url?: string
    model?: string
    timeout_ms?: number
  }
}

export interface AISettingsResponse {
  source: 'online' | 'env'
  online: AIOnlineSettings | null
  env: {
    provider: AIProvider
    model_path: string
    ollama: AIOllamaConfig
  }
  effective: {
    provider: AIProvider
    model_path: string
    ollama: AIOllamaConfig
  }
}

export interface UpdateAiSettingsBody {
  provider: AIProvider
  model_path?: string
  ollama?: {
    base_url?: string
    model?: string
    timeout_ms?: number
  }
}

export interface TestAiConnectionResult {
  version: string
  models: string[]
  base_url: string
}

export function getAiSettings(): Promise<AISettingsResponse> {
  return apiRequest<AISettingsResponse>({
    url: '/api/settings/ai',
    method: 'GET',
  })
}

export function updateAiSettings(
  body: UpdateAiSettingsBody
): Promise<AISettingsResponse> {
  return apiRequest<AISettingsResponse>({
    url: '/api/settings/ai',
    method: 'PUT',
    data: body,
  })
}

export function resetAiSettings(): Promise<AISettingsResponse> {
  return apiRequest<AISettingsResponse>({
    url: '/api/settings/ai',
    method: 'DELETE',
  })
}

export function testAiConnection(body?: {
  base_url?: string
}): Promise<TestAiConnectionResult> {
  return apiRequest<TestAiConnectionResult>({
    url: '/api/settings/ai/test',
    method: 'POST',
    data: body || {},
  })
}
