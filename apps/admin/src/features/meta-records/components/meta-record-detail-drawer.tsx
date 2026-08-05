import { useQuery } from '@tanstack/react-query'
import {
  META_FIELD_TYPE_LABELS,
  getMetaRecord,
  type MetaFieldItem,
  type MetaFieldType,
} from '@/api/meta'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type MetaRecordDetailDrawerProps = {
  recordId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  tableNameById: Map<string, string>
}

function formatDatetime(value: unknown, format?: string): string {
  const ms =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN
  if (!Number.isFinite(ms)) {
    return value == null ? '—' : String(value)
  }
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return String(value)
  // Simple format tokens; fall back to locale string.
  if (!format) return d.toLocaleString()
  const pad = (n: number) => String(n).padStart(2, '0')
  return format
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/DD/g, pad(d.getDate()))
    .replace(/HH/g, pad(d.getHours()))
    .replace(/mm/g, pad(d.getMinutes()))
    .replace(/ss/g, pad(d.getSeconds()))
}

function renderValue(field: MetaFieldItem, value: unknown): React.ReactNode {
  if (value === undefined || value === null || value === '') {
    return <span className='text-muted-foreground'>—</span>
  }

  if (
    field.type === 'datetime' ||
    field.type === 'created_at' ||
    field.type === 'updated_at'
  ) {
    return (
      <span className='text-sm'>
        {formatDatetime(value, field.config?.format)}
      </span>
    )
  }

  if (field.type === 'single_select') {
    return <Badge variant='secondary'>{String(value)}</Badge>
  }

  if (field.type === 'multi_select' && Array.isArray(value)) {
    return (
      <div className='flex flex-wrap gap-1'>
        {value.map((v) => (
          <Badge key={String(v)} variant='secondary'>
            {String(v)}
          </Badge>
        ))}
      </div>
    )
  }

  if (
    (field.type === 'one_way_link' ||
      field.type === 'two_way_link' ||
      field.type === 'parent_record') &&
    (Array.isArray(value) || typeof value === 'string')
  ) {
    const ids = Array.isArray(value) ? value : [value]
    return (
      <div className='flex flex-col gap-1'>
        {ids.map((id) => (
          <code key={String(id)} className='text-xs'>
            {String(id)}
          </code>
        ))}
      </div>
    )
  }

  if (field.type === 'attachment' && Array.isArray(value)) {
    return (
      <div className='flex flex-col gap-1'>
        {value.map((item, idx) => {
          const link =
            item && typeof item === 'object' && 'file_link' in item
              ? String((item as { file_link: string }).file_link)
              : String(item)
          return (
            <a
              key={`${link}-${idx}`}
              href={link}
              target='_blank'
              rel='noreferrer'
              className='text-primary text-sm underline'
            >
              {link}
            </a>
          )
        })}
      </div>
    )
  }

  if (typeof value === 'object') {
    return (
      <pre className='bg-muted max-h-40 overflow-auto rounded-md p-2 text-xs'>
        {JSON.stringify(value, null, 2)}
      </pre>
    )
  }

  return <span className='text-sm'>{String(value)}</span>
}

export function MetaRecordDetailDrawer({
  recordId,
  open,
  onOpenChange,
  tableNameById,
}: MetaRecordDetailDrawerProps) {
  const detailQuery = useQuery({
    queryKey: ['meta-records', recordId],
    queryFn: () => getMetaRecord(recordId!),
    enabled: open && !!recordId,
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex w-full flex-col sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>Record Detail</SheetTitle>
          <SheetDescription>
            {recordId ? (
              <code className='text-xs'>{recordId}</code>
            ) : (
              'Record fields'
            )}
          </SheetDescription>
        </SheetHeader>

        <div className='flex-1 overflow-y-auto px-1 pb-6'>
          {detailQuery.isLoading ? (
            <div className='space-y-4'>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className='space-y-1.5'>
                  <Skeleton className='h-3 w-24' />
                  <Skeleton className='h-5 w-40' />
                </div>
              ))}
            </div>
          ) : detailQuery.isError ? (
            <p className='text-destructive text-sm'>
              {(detailQuery.error as Error)?.message ||
                'Failed to load record.'}
            </p>
          ) : detailQuery.data ? (
            <div className='space-y-5'>
              <div className='grid grid-cols-2 gap-3'>
                <div>
                  <p className='text-muted-foreground text-xs uppercase'>
                    Table
                  </p>
                  <p className='text-sm'>
                    {tableNameById.get(detailQuery.data.table_id) ||
                      detailQuery.data.table_id}
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground text-xs uppercase'>
                    App ID
                  </p>
                  <p className='truncate font-mono text-xs'>
                    {detailQuery.data.app_id}
                  </p>
                </div>
              </div>

              <div className='space-y-4'>
                {detailQuery.data.fields.map((field) => (
                  <div key={field.id} className='space-y-1.5 border-b pb-3'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <p className='text-sm font-medium'>{field.name}</p>
                      <Badge variant='outline'>
                        {META_FIELD_TYPE_LABELS[
                          field.type as MetaFieldType
                        ] || field.type}
                      </Badge>
                      {field.is_system && <Badge>system</Badge>}
                    </div>
                    {renderValue(field, detailQuery.data.data[field.name])}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
