import { type ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { type App } from '../data/schema'
import { DataTableRowActions } from './data-table-row-actions'

const statusClass = new Map<string, string>([
  ['active', 'bg-teal-100/50 text-teal-900 dark:text-teal-200 border-teal-300'],
  [
    'disabled',
    'bg-neutral-300/40 border-neutral-400 text-muted-foreground',
  ],
])

export const appsColumns: ColumnDef<App>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Name' />
    ),
    cell: ({ row }) => (
      <LongText className='max-w-48 font-medium'>{row.getValue('name')}</LongText>
    ),
    enableHiding: false,
  },
  {
    accessorKey: 'description',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Description' />
    ),
    cell: ({ row }) => {
      const desc = row.getValue('description') as string
      return (
        <LongText className='max-w-72 text-muted-foreground'>
          {desc || '—'}
        </LongText>
      )
    },
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
        <Badge variant='outline' className={cn('capitalize', statusClass.get(status))}>
          {status}
        </Badge>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Created' />
    ),
    cell: ({ row }) => {
      const value = row.getValue('created_at') as string
      return (
        <span className='text-nowrap text-sm text-muted-foreground'>
          {value ? new Date(value).toLocaleString() : '—'}
        </span>
      )
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
