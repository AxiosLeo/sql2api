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
import { listModels } from '@/api/models'
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
import { createModelsColumns } from './models-columns'

type ModelsTableProps = {
  search: Record<string, unknown>
  navigate: NavigateFn
}

export function ModelsTable({ search, navigate }: ModelsTableProps) {
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
  const connectionId =
    typeof search.connection_id === 'string' && search.connection_id.trim()
      ? search.connection_id.trim()
      : undefined

  const appsQuery = useQuery({
    queryKey: ['apps', { page: 1, size: 100 }],
    queryFn: () => listApps({ page: 1, size: 100 }),
  })

  const connectionsQuery = useQuery({
    queryKey: ['connections', { page: 1, size: 100 }],
    queryFn: () => listConnections({ page: 1, size: 100 }),
  })

  const appNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const app of appsQuery.data?.list ?? []) {
      map.set(app.id, app.name)
    }
    return map
  }, [appsQuery.data?.list])

  const connectionNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const conn of connectionsQuery.data?.list ?? []) {
      map.set(conn.id, conn.name)
    }
    return map
  }, [connectionsQuery.data?.list])

  const filteredConnections = useMemo(() => {
    const list = connectionsQuery.data?.list ?? []
    if (!appId) return list
    return list.filter((c) => c.app_id === appId)
  }, [connectionsQuery.data?.list, appId])

  const columns = useMemo(
    () => createModelsColumns({ appNameById, connectionNameById }),
    [appNameById, connectionNameById]
  )

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: [
      'models',
      { page, size, keyword, app_id: appId, connection_id: connectionId },
    ],
    queryFn: () =>
      listModels({
        page,
        size,
        keyword,
        app_id: appId,
        connection_id: connectionId,
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

  // Clear connection filter if it no longer belongs to selected app
  useEffect(() => {
    if (!connectionId || !appId) return
    const stillValid = filteredConnections.some((c) => c.id === connectionId)
    if (!stillValid) {
      navigate({
        search: (prev) => ({
          ...prev,
          page: 1,
          connection_id: undefined,
        }),
      })
    }
  }, [appId, connectionId, filteredConnections, navigate])

  const onAppFilterChange = (value: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        page: 1,
        app_id: value === 'all' ? undefined : value,
        connection_id: undefined,
      }),
    })
  }

  const onConnectionFilterChange = (value: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        page: 1,
        connection_id: value === 'all' ? undefined : value,
      }),
    })
  }

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <div className='flex-1'>
          <DataTableToolbar
            table={table}
            searchPlaceholder='Search by table name...'
          />
        </div>
        <Select value={appId || 'all'} onValueChange={onAppFilterChange}>
          <SelectTrigger className='w-[180px]'>
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
        <Select
          value={connectionId || 'all'}
          onValueChange={onConnectionFilterChange}
        >
          <SelectTrigger className='w-[200px]'>
            <SelectValue placeholder='All Connections' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All Connections</SelectItem>
            {filteredConnections.map((conn) => (
              <SelectItem key={conn.id} value={conn.id}>
                {conn.name}
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
                  {(error as Error)?.message || 'Failed to load models.'}
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
                  No models found.
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
