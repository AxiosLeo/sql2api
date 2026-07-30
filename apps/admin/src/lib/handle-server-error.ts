import { AxiosError } from 'axios'
import { toast } from 'sonner'
import type { ApiEnvelope } from '@/lib/api-client'

export function handleServerError(error: unknown) {
  // eslint-disable-next-line no-console
  console.log(error)

  let errMsg = 'Something went wrong!'

  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    Number(error.status) === 204
  ) {
    errMsg = 'Content not found.'
  }

  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiEnvelope | { title?: string } | undefined
    if (data && typeof data === 'object') {
      if ('message' in data && typeof data.message === 'string' && data.message) {
        errMsg = data.message
      } else if ('title' in data && typeof data.title === 'string' && data.title) {
        errMsg = data.title
      } else if (error.message) {
        errMsg = error.message
      }
    } else if (error.message) {
      errMsg = error.message
    }
  }

  toast.error(errMsg)
}
