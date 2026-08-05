import { type ColumnDef } from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { type MetaTable } from '../data/schema'
import { DataTableRowActions } from './data-table-row-actions'

export type MetaTablesColumnsOptions = {
  appNameById: Map<string, string>
}

export function createMetaTablesColumns(
  options: MetaTablesColumnsOptions
): ColumnDef<MetaTable>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Name' />
      ),
      cell: ({ row }) => (
        <Link
          to='/meta-tables/$tableId'
          params={{ tableId: row.original.id }}
          className='font-medium text-primary hover:underline'
        >
          <LongText className='max-w-48'>{row.getValue('name')}</LongText>
        </Link>
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
      id: 'field_count',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Fields' />
      ),
      cell: ({ row }) => (
        <Badge variant='outline'>{row.original.field_count}</Badge>
      ),
      enableSorting: false,
    },
    {
      id: 'record_count',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Records' />
      ),
      cell: ({ row }) => (
        <Badge variant='secondary'>{row.original.record_count}</Badge>
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
          <Badge variant={status === 'active' ? 'default' : 'outline'}>
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
      id: 'actions',
      cell: DataTableRowActions,
    },
  ]
}
