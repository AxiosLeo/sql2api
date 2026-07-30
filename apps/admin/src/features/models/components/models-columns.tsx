import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/data-table'
import { LongText } from '@/components/long-text'
import { type Model } from '../data/schema'
import { DataTableRowActions } from './data-table-row-actions'

export type ModelsColumnsOptions = {
  appNameById: Map<string, string>
  connectionNameById: Map<string, string>
}

export function createModelsColumns(
  options: ModelsColumnsOptions
): ColumnDef<Model>[] {
  return [
    {
      accessorKey: 'table_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Table Name' />
      ),
      cell: ({ row }) => (
        <LongText className='max-w-48 font-medium'>
          {row.getValue('table_name')}
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
      accessorKey: 'connection_id',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Connection' />
      ),
      cell: ({ row }) => {
        const connectionId = row.getValue('connection_id') as string
        const name = options.connectionNameById.get(connectionId)
        return (
          <LongText className='max-w-40 text-muted-foreground'>
            {name || connectionId}
          </LongText>
        )
      },
      enableSorting: false,
    },
    {
      accessorKey: 'comment',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Comment' />
      ),
      cell: ({ row }) => {
        const comment = row.getValue('comment') as string
        return (
          <LongText className='max-w-56 text-muted-foreground'>
            {comment || '—'}
          </LongText>
        )
      },
      enableSorting: false,
    },
    {
      id: 'columns_count',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Columns' />
      ),
      cell: ({ row }) => (
        <Badge variant='outline'>{row.original.columns.length}</Badge>
      ),
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
