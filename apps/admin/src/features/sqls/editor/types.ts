import { z } from 'zod'
import type { GenerateStepSummary } from '@/api/sqls'

export const paramSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  rule: z.string().min(1, 'Rule is required.'),
  description: z.string().optional(),
  default: z.string().optional(),
})

function isPlainJsonObject(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as unknown
    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)
  } catch {
    return false
  }
}

export const formSchema = z
  .object({
    connection_id: z.string().min(1, 'Connection is required.'),
    name: z
      .string()
      .min(1, 'Name is required.')
      .max(64, 'Name must be at most 64 characters.'),
    description: z.string().optional(),
    sql: z.string().min(1, 'SQL is required.'),
    params: z.array(paramSchema),
    status: z.enum(['enabled', 'disabled', 'draft']),
    mock_enabled: z.boolean(),
    mock_data: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!values.mock_enabled) return
    if (!isPlainJsonObject(values.mock_data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mock_data'],
        message: 'Mock data must be a valid JSON object when mock is enabled.',
      })
    }
  })

export type SqlEditorForm = z.infer<typeof formSchema>

export type AiMeta = {
  explanation?: string
  sql_type?: string
  method?: string
  selected_tables?: string[]
  steps?: GenerateStepSummary[]
}

export const DEFAULT_MOCK_DATA = '{\n  \n}'

export function formatMockDataJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return DEFAULT_MOCK_DATA
  }
}
