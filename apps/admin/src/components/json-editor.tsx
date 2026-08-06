import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { useTheme } from '@/context/theme-provider'
import { cn } from '@/lib/utils'

type JsonEditorProps = {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  minHeight?: string
  className?: string
}

export function JsonEditor({
  value,
  onChange,
  readOnly = false,
  minHeight = '200px',
  className,
}: JsonEditorProps) {
  const { resolvedTheme } = useTheme()

  const extensions = useMemo(() => [json()], [])

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
