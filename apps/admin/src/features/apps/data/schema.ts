import { z } from 'zod'

export const appStatusSchema = z.union([
  z.literal('active'),
  z.literal('disabled'),
])
export type AppStatus = z.infer<typeof appStatusSchema>

export const appSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: appStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
})
export type App = z.infer<typeof appSchema>
