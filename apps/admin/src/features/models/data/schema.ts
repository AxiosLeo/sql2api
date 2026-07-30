import { z } from 'zod'

export const columnDefinitionSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean(),
  default: z.string().nullable(),
  comment: z.string(),
  is_primary: z.boolean(),
  is_auto_increment: z.boolean(),
})
export type ColumnDefinition = z.infer<typeof columnDefinitionSchema>

export const modelSchema = z.object({
  id: z.string(),
  app_id: z.string(),
  connection_id: z.string(),
  table_name: z.string(),
  comment: z.string(),
  columns: z.array(columnDefinitionSchema),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Model = z.infer<typeof modelSchema>
