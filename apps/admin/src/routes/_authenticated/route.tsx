import { createFileRoute, redirect } from '@tanstack/react-router'
import { profile } from '@/api/auth'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    try {
      const user = await profile()
      useAuthStore.getState().auth.setUser({ username: user.username })
    } catch {
      useAuthStore.getState().auth.reset()
      throw redirect({
        to: '/sign-in',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  component: AuthenticatedLayout,
})
