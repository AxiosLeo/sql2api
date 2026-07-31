import { createFileRoute } from '@tanstack/react-router'
import { SystemSettings } from '@/features/system-settings'

export const Route = createFileRoute('/_authenticated/system/')({
  component: SystemSettings,
})
