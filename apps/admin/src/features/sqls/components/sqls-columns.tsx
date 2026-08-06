import { type ColumnDef } from '@tanstack/react-table'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { copyToClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { type Sql } from '../data/schema'
import { DataTableRowActions } from './data-table-row-actions'

const statusClass = new Map<string, string>([
  [
    'enabled',
    'bg-teal-100/50 text-teal-900 dark:text-teal-200 border-teal-300',
  ],
  [
    'disabled',
    'bg-neutral-300/40 border-neutral-400 text-muted-foreground',
  ],
  [
    'draft',
    'bg-amber-100/50 text-amber-900 dark:text-amber-200 border-amber-300',
  ],
])

const typeClass = new Map<string, string>([
  ['select', 'bg-blue-100/50 text-blue-900 dark:text-blue-200 border-blue-300'],
  [
    'insert',
    'bg-emerald-100/50 text-emerald-900 dark:text-emerald-200 border-emerald-300',
  ],
  [
    'update',
    'bg-amber-100/50 text-amber-900 dark:text-amber-200 border-amber-300',
  ],
  [
    'complex',
    'bg-violet-100/50 text-violet-900 dark:text-violet-200 border-violet-300',
  ],
])

export type SqlsColumnsOptions = {
  appNameById: Map<string, string>
  connectionNameById: Map<string, string>
}

export function createSqlsColumns(
  options: SqlsColumnsOptions
): ColumnDef<Sql>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Name' />
      ),
      cell: ({ row }) => (
        <div className='flex max-w-48 items-center gap-1.5'>
          <LongText className='max-w-40 font-medium'>
            {row.getValue('name')}
          </LongText>
          {row.original.mock_enabled ? (
            <Badge
              variant='outline'
              className='shrink-0 border-sky-300 bg-sky-100/50 text-sky-900 dark:text-sky-200'
            >
              Mock
            </Badge>
          ) : null}
        </div>
      ),
      enableHiding: false,
    },
    {
      accessorKey: 'app_id',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='App' />
      ),
      cell: ({ row }) => {
        const appId = row.getValue('app_id') as string
        const name = options.appNameById.get(appId)
        return (
          <LongText className='max-w-36 text-muted-foreground'>
            {name || appId}
          </LongText>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: 'connection_id',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Connection' />
      ),
      cell: ({ row }) => {
        const connectionId = row.getValue('connection_id') as string
        const name = options.connectionNameById.get(connectionId)
        return (
          <LongText className='max-w-36 text-muted-foreground'>
            {name || connectionId}
          </LongText>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: 'sql_type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Type' />
      ),
      cell: ({ row }) => {
        const type = row.getValue('sql_type') as string
        return (
          <Badge
            variant='outline'
            className={cn('capitalize', typeClass.get(type))}
          >
            {type}
          </Badge>
        )
      },
      enableSorting: false,
    },
    {
      id: 'endpoint',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Endpoint' />
      ),
      cell: ({ row }) => {
        const method = row.original.method
        const endpoint = row.original.endpoint
        const copyEndpoint = async () => {
          try {
            await copyToClipboard(endpoint)
            toast.success('Endpoint copied.')
          } catch {
            toast.error('Failed to copy endpoint.')
          }
        }
        return (
          <div className='flex min-w-0 max-w-[220px] items-center gap-1 overflow-hidden'>
            <Badge variant='secondary' className='shrink-0 font-mono text-xs'>
              {method}
            </Badge>
            <button
              type='button'
              title='Click to copy endpoint'
              onClick={copyEndpoint}
              className='min-w-0 flex-1 cursor-pointer truncate text-start font-mono text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline'
            >
              {endpoint}
            </button>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='h-7 w-7 shrink-0 cursor-pointer'
              title='Copy endpoint'
              onClick={copyEndpoint}
            >
              <Copy className='h-3.5 w-3.5' />
            </Button>
          </div>
        )
      },
      enableSorting: false,
      meta: {
        className: 'w-[240px] max-w-[240px]',
        tdClassName: 'w-[240px] max-w-[240px] overflow-hidden',
      },
    },
    {
      id: 'review',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Review' />
      ),
      cell: ({ row }) => {
        const passed = row.original.review?.passed
        return (
          <Badge
            variant='outline'
            className={cn(
              'whitespace-nowrap',
              passed
                ? 'bg-teal-100/50 text-teal-900 dark:text-teal-200 border-teal-300'
                : 'bg-red-100/50 text-red-900 dark:text-red-200 border-red-300'
            )}
          >
            {passed ? 'passed' : 'failed'}
          </Badge>
        )
      },
      enableSorting: false,
      meta: {
        className: 'w-[100px]',
        tdClassName: 'w-[100px] whitespace-nowrap',
      },
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => {
        const status = row.getValue('status') as string
        return (
          <Badge
            variant='outline'
            className={cn(
              'capitalize whitespace-nowrap',
              statusClass.get(status)
            )}
          >
            {status}
          </Badge>
        )
      },
      enableSorting: false,
      meta: {
        className: 'w-[100px]',
        tdClassName: 'w-[100px] whitespace-nowrap',
      },
    },
    {
      accessorKey: 'updated_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Updated' />
      ),
      cell: ({ row }) => {
        const value = row.getValue('updated_at') as string
        return (
          <span className='text-nowrap text-sm text-muted-foreground'>
            {value ? new Date(value).toLocaleString() : '—'}
          </span>
        )
      },
    },
    {
      id: 'actions',
      cell: DataTableRowActions,
    },
  ]
}
