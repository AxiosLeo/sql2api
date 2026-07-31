import { type ColumnDef } from '@tanstack/react-table'
import {
  DATASOURCE_LABELS,
  datasourceProtocol,
  isDatasourceType,
} from '@/lib/datasource'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { type Connection } from '../data/schema'
import { DataTableRowActions } from './data-table-row-actions'

const statusClass = new Map<string, string>([
  ['active', 'bg-teal-100/50 text-teal-900 dark:text-teal-200 border-teal-300'],
  [
    'disabled',
    'bg-neutral-300/40 border-neutral-400 text-muted-foreground',
  ],
])

const protocolClass = {
  mysql: 'bg-blue-100/50 text-blue-900 dark:text-blue-200 border-blue-300',
  postgresql:
    'bg-indigo-100/50 text-indigo-900 dark:text-indigo-200 border-indigo-300',
  oracle: 'bg-red-100/50 text-red-900 dark:text-red-200 border-red-300',
  sqlserver:
    'bg-emerald-100/50 text-emerald-900 dark:text-emerald-200 border-emerald-300',
} as const

const fallbackTypeClass =
  'bg-neutral-100/50 text-neutral-900 dark:text-neutral-200 border-neutral-300'

function typeBadgeClass(type: string): string {
  if (!isDatasourceType(type)) {
    return fallbackTypeClass
  }
  return protocolClass[datasourceProtocol(type)]
}

function typeBadgeLabel(type: string): string {
  if (isDatasourceType(type)) {
    return DATASOURCE_LABELS[type]
  }
  return type
}

export type ConnectionsColumnsOptions = {
  appNameById: Map<string, string>
}

export function createConnectionsColumns(
  options: ConnectionsColumnsOptions
): ColumnDef<Connection>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Name' />
      ),
      cell: ({ row }) => (
        <LongText className='max-w-48 font-medium'>
          {row.getValue('name')}
        </LongText>
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
          <LongText className='max-w-40 text-muted-foreground'>
            {name || appId}
          </LongText>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: 'type',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Type' />
      ),
      cell: ({ row }) => {
        const type = row.getValue('type') as string
        return (
          <Badge variant='outline' className={cn(typeBadgeClass(type))}>
            {typeBadgeLabel(type)}
          </Badge>
        )
      },
      enableSorting: false,
    },
    {
      id: 'host_port',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Host:Port' />
      ),
      cell: ({ row }) => (
        <span className='text-nowrap text-sm'>
          {row.original.host}:{row.original.port}
        </span>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'database',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Database' />
      ),
      cell: ({ row }) => (
        <LongText className='max-w-40'>{row.getValue('database')}</LongText>
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'username',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Username' />
      ),
      cell: ({ row }) => (
        <span className='text-nowrap text-sm'>{row.getValue('username')}</span>
      ),
      enableSorting: false,
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
            className={cn('capitalize', statusClass.get(status))}
          >
            {status}
          </Badge>
        )
      },
      enableSorting: false,
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
