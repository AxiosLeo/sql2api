import { z } from 'zod'

export const sqlTypeSchema = z.union([
  z.literal('select'),
  z.literal('insert'),
  z.literal('update'),
  z.literal('complex'),
])
export type SqlType = z.infer<typeof sqlTypeSchema>

export const sqlStatusSchema = z.union([
  z.literal('enabled'),
  z.literal('disabled'),
])
export type SqlStatus = z.infer<typeof sqlStatusSchema>

export const sqlParamSchema = z.object({
  name: z.string(),
  rule: z.string(),
  description: z.string().optional(),
  default: z.unknown().optional(),
})
export type SqlParam = z.infer<typeof sqlParamSchema>

export const reviewIssueSchema = z.object({
  severity: z.union([
    z.literal('error'),
    z.literal('warning'),
    z.literal('info'),
  ]),
  message: z.string(),
  suggestion: z.string().optional(),
})

export const reviewResultSchema = z.object({
  passed: z.boolean(),
  issues: z.array(reviewIssueSchema),
  sql_type: sqlTypeSchema.optional(),
  method: z
    .union([
      z.literal('GET'),
      z.literal('POST'),
      z.literal('PATCH'),
    ])
    .optional(),
})

export const sqlSchema = z.object({
  id: z.string(),
  app_id: z.string(),
  connection_id: z.string(),
  name: z.string(),
  description: z.string(),
  sql: z.string(),
  sql_type: sqlTypeSchema,
  method: z.union([
    z.literal('GET'),
    z.literal('POST'),
    z.literal('PATCH'),
  ]),
  endpoint: z.string(),
  params: z.array(sqlParamSchema),
  status: sqlStatusSchema,
  review: reviewResultSchema,
  created_at: z.string(),
  updated_at: z.string(),
})
export type Sql = z.infer<typeof sqlSchema>
