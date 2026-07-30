import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Connections } from '@/features/connections'

const connectionsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  size: z.number().optional().catch(20),
  keyword: z.string().optional().catch(''),
  app_id: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/connections/')({
  validateSearch: connectionsSearchSchema,
  component: Connections,
})
