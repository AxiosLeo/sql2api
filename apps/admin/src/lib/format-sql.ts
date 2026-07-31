import { format } from 'sql-formatter'
import type { SqlDialect } from '@/components/sql-editor'

/**
 * Pretty-print SQL for the given dialect.
 * Throws if the formatter cannot parse the input.
 * Supports sql2api `:name` placeholders.
 */
export function formatSql(
  sql: string,
  dialect: SqlDialect = 'mysql'
): string {
  const trimmed = sql.trim()
  if (!trimmed) return sql
  return format(trimmed, {
    language: dialect === 'postgresql' ? 'postgresql' : 'mysql',
    tabWidth: 2,
    keywordCase: 'upper',
    paramTypes: { named: [':'] },
  })
}
