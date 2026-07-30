import { useEffect, useMemo, useState } from 'react'
import {
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
import { listApps } from '@/api/apps'
import { listConnections } from '@/api/connections'
import { cn } from '@/lib/utils'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createConnectionsColumns } from './connections-columns'

type ConnectionsTableProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
}

export function ConnectionsTable({ search, navigate }: ConnectionsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})

  const {
    globalFilter,
    onGlobalFilterChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate,
    pagination: {
      defaultPage: 1,
      defaultPageSize: 20,
      pageSizeKey: 'size',
    },
    globalFilter: { enabled: true, key: 'keyword' },
    columnFilters: [],
  })

  const page = pagination.pageIndex + 1
  const size = pagination.pageSize
  const keyword =
    typeof globalFilter === 'string' && globalFilter.trim()
      ? globalFilter.trim()
      : undefined
  const appId =
    typeof search.app_id === 'string' && search.app_id.trim()
      ? search.app_id.trim()
      : undefined

  const appsQuery = useQuery({
    queryKey: ['apps', { page: 1, size: 100 }],
    queryFn: () => listApps({ page: 1, size: 100 }),
  })

  const appNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const app of appsQuery.data?.list ?? []) {
      map.set(app.id, app.name)
    }
    return map
  }, [appsQuery.data?.list])

  const columns = useMemo(
    () => createConnectionsColumns({ appNameById }),
    [appNameById]
  )

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['connections', { page, size, keyword, app_id: appId }],
    queryFn: () =>
      listConnections({
        page,
        size,
        keyword,
        app_id: appId,
      }),
  })

  const list = data?.list ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / size) || 1)

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: list,
    columns,
    pageCount,
    manualPagination: true,
    manualFiltering: true,
    state: {
      sorting,
      pagination,
      columnVisibility,
      globalFilter,
    },
    onPaginationChange,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  useEffect(() => {
    ensurePageInRange(pageCount)
  }, [pageCount, ensurePageInRange])

  const onAppFilterChange = (value: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        page: 1,
        app_id: value === 'all' ? undefined : value,
      }),
    })
  }

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='flex-1'>
          <DataTableToolbar
            table={table}
            searchPlaceholder='Search by name...'
          />
        </div>
        <Select
          value={appId || 'all'}
          onValueChange={onAppFilterChange}
        >
          <SelectTrigger className='w-[200px]'>
            <SelectValue placeholder='All Apps' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Apps</SelectItem>
            {(appsQuery.data?.list ?? []).map((app) => (
              <SelectItem key={app.id} value={app.id}>
                {app.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='overflow-hidden rounded-md border'>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className='group/row'>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className={cn(
                      'bg-background group-hover/row:bg-muted',
                      header.column.columnDef.meta?.className,
                      header.column.columnDef.meta?.thClassName
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className='h-24 text-center'>
                  Loading...
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-24 text-center text-destructive'
                >
                  {(error as Error)?.message || 'Failed to load connections.'}
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className='group/row'>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        'bg-background group-hover/row:bg-muted',
                        cell.column.columnDef.meta?.className,
                        cell.column.columnDef.meta?.tdClassName
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className='h-24 text-center'>
                  No connections found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        table={table}
        className={cn('mt-auto', isFetching && !isLoading && 'opacity-70')}
      />
    </div>
  )
}
