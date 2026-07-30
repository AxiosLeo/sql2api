import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/auth-store'

export interface ApiEnvelope<T = unknown> {
  request_id: string
  timestamp: number
  code: string
  message: string
  data: T
}

const SKIP_AUTH_REDIRECT_PATHS = ['/api/login', '/api/profile', '/api/logout']

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

function isSuccessCode(code: string | undefined): boolean {
  if (!code) return false
  return code === '200' || code.startsWith('200')
}

apiClient.interceptors.response.use(
  (response) => {
    const payload = response.data as ApiEnvelope | unknown
    if (
      payload &&
      typeof payload === 'object' &&
      'code' in payload &&
      'data' in payload
    ) {
      const envelope = payload as ApiEnvelope
      if (!isSuccessCode(envelope.code)) {
        const err = new AxiosError(
          envelope.message || 'Request failed',
          envelope.code,
          response.config,
          response.request,
          {
            ...response,
            status: Number(envelope.code) || response.status,
            data: envelope,
          }
        )
        return Promise.reject(err)
      }
      response.data = envelope.data
    }
    return response
  },
  (error: AxiosError<ApiEnvelope>) => {
    const status = error.response?.status
    const url = error.config?.url || ''
    const skipRedirect = SKIP_AUTH_REDIRECT_PATHS.some((p) => url.includes(p))

    if (status === 401 && !skipRedirect) {
      useAuthStore.getState().auth.reset()
      const redirect = `${window.location.pathname}${window.location.search}`
      const search = new URLSearchParams({ redirect }).toString()
      if (!window.location.pathname.startsWith('/sign-in')) {
        window.location.assign(`/sign-in?${search}`)
      }
    }

    return Promise.reject(error)
  }
)

/** Typed helper that returns unwrapped `data` from the API envelope. */
export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const res = await apiClient.request<T>(config)
  return res.data
}
