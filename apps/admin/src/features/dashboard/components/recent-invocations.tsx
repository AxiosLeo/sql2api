import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { type InvokeLogItem } from '@/api/stats'

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return iso
  }
}

function LogRow({ log }: { log: InvokeLogItem }) {
  const name = log.sql_name || log.sql_id
  return (
    <div className='flex items-center gap-3'>
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          log.success ? 'bg-green-500' : 'bg-red-500'
        )}
        aria-hidden
      />
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <Badge variant='secondary' className='shrink-0 font-mono text-xs'>
            {log.method}
          </Badge>
          <p className='truncate text-sm font-medium' title={name}>
            {name}
          </p>
        </div>
        <p
          className='text-muted-foreground mt-0.5 truncate text-xs'
          title={log.error_message ?? undefined}
        >
          {log.success
            ? `${log.status_code} · ${log.row_count ?? 0} rows`
            : `${log.status_code} · ${log.error_message || 'Failed'}`}
          {' · '}
          {relativeTime(log.created_at)}
        </p>
      </div>
      <div
        className={cn(
          'shrink-0 text-sm font-medium tabular-nums',
          log.success
            ? 'text-muted-foreground'
            : 'text-red-600 dark:text-red-400'
        )}
      >
        {log.latency_ms}ms
      </div>
    </div>
  )
}

export function RecentInvocations({
  logs,
  isLoading,
}: {
  logs: InvokeLogItem[] | undefined
  isLoading: boolean
}) {
  if (isLoading || !logs) {
    return (
      <div className='space-y-5'>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className='flex items-center gap-3'>
            <Skeleton className='h-2 w-2 rounded-full' />
            <div className='flex-1 space-y-1.5'>
              <Skeleton className='h-4 w-3/4' />
              <Skeleton className='h-3 w-1/2' />
            </div>
            <Skeleton className='h-4 w-10' />
          </div>
        ))}
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className='text-muted-foreground flex h-[280px] items-center justify-center text-sm'>
        No invocations recorded yet.
      </div>
    )
  }

  return (
    <div className='space-y-5'>
      {logs.map((log) => (
        <LogRow key={log.id} log={log} />
      ))}
    </div>
  )
}
