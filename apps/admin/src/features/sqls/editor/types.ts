import { z } from 'zod'
import type { GenerateStepSummary } from '@/api/sqls'

export const paramSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  rule: z.string().min(1, 'Rule is required.'),
  description: z.string().optional(),
  default: z.string().optional(),
})

export const formSchema = z.object({
  connection_id: z.string().min(1, 'Connection is required.'),
  name: z
    .string()
    .min(1, 'Name is required.')
    .max(64, 'Name must be at most 64 characters.'),
  description: z.string().optional(),
  sql: z.string().min(1, 'SQL is required.'),
  params: z.array(paramSchema),
  status: z.enum(['enabled', 'disabled', 'draft']),
})

export type SqlEditorForm = z.infer<typeof formSchema>

export type AiMeta = {
  explanation?: string
  sql_type?: string
  method?: string
  selected_tables?: string[]
  steps?: GenerateStepSummary[]
}
