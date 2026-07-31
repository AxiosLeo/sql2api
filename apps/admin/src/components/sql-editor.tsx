import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql, MySQL, PostgreSQL, MSSQL, PLSQL } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { useTheme } from '@/context/theme-provider'
import { cn } from '@/lib/utils'

export type SqlDialect = 'mysql' | 'postgresql' | 'oracle' | 'sqlserver'

type SqlEditorProps = {
  value: string
  onChange?: (value: string) => void
  dialect?: SqlDialect
  readOnly?: boolean
  minHeight?: string
  className?: string
}

function dialectExtension(dialect: SqlDialect) {
  switch (dialect) {
    case 'postgresql':
      return PostgreSQL
    case 'oracle':
      return PLSQL
    case 'sqlserver':
      return MSSQL
    default:
      return MySQL
  }
}

export function SqlEditor({
  value,
  onChange,
  dialect = 'mysql',
  readOnly = false,
  minHeight = '200px',
  className,
}: SqlEditorProps) {
  const { resolvedTheme } = useTheme()

  const extensions = useMemo(
    () => [
      sql({
        dialect: dialectExtension(dialect),
      }),
    ],
    [dialect]
  )

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border bg-background text-sm',
        className
      )}
    >
      <CodeMirror
        value={value}
        height={minHeight}
        theme={resolvedTheme === 'dark' ? oneDark : 'light'}
        extensions={extensions}
        editable={!readOnly}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
        }}
        onChange={(val) => onChange?.(val)}
      />
    </div>
  )
}
