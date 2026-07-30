import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Sqls } from '@/features/sqls'

const sqlsSearchSchema = z.object({
  page: z.number().optional().catch(1),
  size: z.number().optional().catch(20),
  keyword: z.string().optional().catch(''),
  app_id: z.string().optional().catch(''),
  connection_id: z.string().optional().catch(''),
  sql_type: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/sqls/')({
  validateSearch: sqlsSearchSchema,
  component: Sqls,
})
