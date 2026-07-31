import { createFileRoute } from '@tanstack/react-router'
import { ApiDocs } from '@/features/api-docs'

export const Route = createFileRoute('/_authenticated/api-docs/')({
  component: ApiDocs,
})
