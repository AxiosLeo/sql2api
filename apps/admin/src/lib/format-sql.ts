import { format } from 'sql-formatter'
import type { SqlDialect } from '@/components/sql-editor'

function formatterLanguage(
  dialect: SqlDialect
): 'mysql' | 'postgresql' | 'plsql' | 'transactsql' {
  switch (dialect) {
    case 'postgresql':
      return 'postgresql'
    case 'oracle':
      return 'plsql'
    case 'sqlserver':
      return 'transactsql'
    default:
      return 'mysql'
  }
}

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
    language: formatterLanguage(dialect),
    tabWidth: 2,
    keywordCase: 'upper',
    paramTypes: { named: [':'] },
  })
}
