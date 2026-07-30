import { z } from 'zod'

export const connectionStatusSchema = z.union([
  z.literal('active'),
  z.literal('disabled'),
])
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>

export const datasourceTypeSchema = z.union([
  z.literal('mysql'),
  z.literal('postgresql'),
])
export type DatasourceType = z.infer<typeof datasourceTypeSchema>

export const connectionSchema = z.object({
  id: z.string(),
  app_id: z.string(),
  name: z.string(),
  type: datasourceTypeSchema,
  host: z.string(),
  port: z.number(),
  username: z.string(),
  database: z.string(),
  status: connectionStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
})
export type Connection = z.infer<typeof connectionSchema>
