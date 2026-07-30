import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql, MySQL, PostgreSQL } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { useTheme } from '@/context/theme-provider'
import { cn } from '@/lib/utils'

export type SqlDialect = 'mysql' | 'postgresql'

type SqlEditorProps = {
  value: string
  onChange?: (value: string) => void
  dialect?: SqlDialect
  readOnly?: boolean
  minHeight?: string
  className?: string
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
        dialect: dialect === 'postgresql' ? PostgreSQL : MySQL,
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
