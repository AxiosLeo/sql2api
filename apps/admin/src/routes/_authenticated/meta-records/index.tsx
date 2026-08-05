import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { MetaRecords } from '@/features/meta-records'

const metaRecordsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  size: z.number().optional().catch(20),
  app_id: z.string().optional().catch(''),
  table_id: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/meta-records/')({
  validateSearch: metaRecordsSearchSchema,
  component: MetaRecords,
})
