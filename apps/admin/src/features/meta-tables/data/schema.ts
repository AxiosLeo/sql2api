import { z } from 'zod'

export const metaTableSchema = z.object({
  id: z.string(),
  app_id: z.string(),
  name: z.string(),
  description: z.string(),
  status: z.enum(['active', 'disabled']),
  field_count: z.number(),
  record_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type MetaTable = z.infer<typeof metaTableSchema>

export const metaFieldSchema = z.object({
  id: z.string(),
  table_id: z.string(),
  name: z.string(),
  type: z.string(),
  validator: z.string(),
  config: z.record(z.string(), z.unknown()).optional(),
  is_system: z.boolean(),
  sort: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type MetaField = z.infer<typeof metaFieldSchema>
