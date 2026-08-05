import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { MetaTables } from '@/features/meta-tables'

const metaTablesSearchSchema = z.object({
  page: z.number().optional().catch(1),
  size: z.number().optional().catch(20),
  keyword: z.string().optional().catch(''),
  app_id: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/meta-tables/')({
  validateSearch: metaTablesSearchSchema,
  component: MetaTables,
})
