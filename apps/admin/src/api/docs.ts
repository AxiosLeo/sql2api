import { apiRequest } from '@/lib/api-client'

export type OpenApiSpec = Record<string, unknown>

export function getOpenApiSpec(params?: {
  app_id?: string
}): Promise<OpenApiSpec> {
  return apiRequest<OpenApiSpec>({
    method: 'GET',
    url: '/api/openapi.json',
    params,
  })
}
