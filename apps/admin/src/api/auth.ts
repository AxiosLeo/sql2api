import { apiRequest } from '@/lib/api-client'

export interface LoginBody {
  username: string
  password: string
}

export interface AdminProfile {
  username: string
}

export interface StatusOk {
  status: string
}

export function login(body: LoginBody): Promise<AdminProfile> {
  return apiRequest<AdminProfile>({
    method: 'POST',
    url: '/api/login',
    data: body,
  })
}

export function profile(): Promise<AdminProfile> {
  return apiRequest<AdminProfile>({
    method: 'GET',
    url: '/api/profile',
  })
}

export function logout(): Promise<StatusOk> {
  return apiRequest<StatusOk>({
    method: 'GET',
    url: '/api/logout',
  })
}
