import { useEffect, useMemo, useState } from 'react'
import {
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { listApps } from '@/api/apps'
import {
  listMetaRecords,
  listMetaTables,
  type MetaRecordListItem,
} from '@/api/meta'
import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { cn } from '@/lib/utils'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination, DataTableColumnHeader } from '@/components/data-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LongText } from '@/components/long-text'
import { MetaRecordDetailDrawer } from './components/meta-record-detail-drawer'

const route = getRouteApi('/_authenticated/meta-records/')

export function MetaRecords() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [detailId, setDetailId] = useState<string | null>(null)

  const { pagination, onPaginationChange, ensurePageInRange } =
    useTableUrlState({
      search,
      navigate,
      pagination: {
        defaultPage: 1,
        defaultPageSize: 20,
        pageSizeKey: 'size',
      },
      globalFilter: { enabled: false },
      columnFilters: [],
    })

  const page = pagination.pageIndex + 1
  const size = pagination.pageSize
  const appId =
    typeof search.app_id === 'string' && search.app_id.trim()
      ? search.app_id.trim()
      : undefined
  const tableId =
    typeof search.table_id === 'string' && search.table_id.trim()
      ? search.table_id.trim()
      : undefined

  const appsQuery = useQuery({
    queryKey: ['apps', { page: 1, size: 100 }],
    queryFn: () => listApps({ page: 1, size: 100 }),
  })

  const tablesQuery = useQuery({
    queryKey: ['meta-tables', { page: 1, size: 100, app_id: appId }],
    queryFn: () =>
      listMetaTables({ page: 1, size: 100, app_id: appId }),
  })

  const tableNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of tablesQuery.data?.list ?? []) {
      map.set(t.id, t.name)
    }
    return map
  }, [tablesQuery.data?.list])

  const columns = useMemo<ColumnDef<MetaRecordListItem>[]>(
    () => [
      {
        accessorKey: 'record_id',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Record ID' />
        ),
        cell: ({ row }) => (
          <LongText className='max-w-56 font-mono text-xs'>
            {row.original.record_id}
          </LongText>
        ),
        enableHiding: false,
      },
      {
        accessorKey: 'table_id',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Table' />
        ),
        cell: ({ row }) => {
          const id = row.original.table_id
          return (
            <LongText className='max-w-40 text-muted-foreground'>
              {tableNameById.get(id) || id}
            </LongText>
          )
        },
        enableSorting: false,
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Created' />
        ),
        cell: ({ row }) => (
          <span className='text-nowrap text-sm text-muted-foreground'>
            {new Date(row.original.created_at).toLocaleString()}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setDetailId(row.original.record_id)}
          >
            <Eye className='me-1 size-4' />
            Detail
          </Button>
        ),
      },
    ],
    [tableNameById]
  )

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: [
      'meta-records',
      { page, size, app_id: appId, table_id: tableId },
    ],
    queryFn: () =>
      listMetaRecords({
        page,
        size,
        app_id: appId,
        table_id: tableId,
      }),
    placeholderData: keepPreviousData,
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
    state: {
      sorting,
      pagination,
      columnVisibility,
    },
    onPaginationChange,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  useEffect(() => {
    if (!data) return
    ensurePageInRange(pageCount)
  }, [data, pageCount, ensurePageInRange])

  useEffect(() => {
    if (!tableId || !appId) return
    const stillValid = (tablesQuery.data?.list ?? []).some(
      (t) => t.id === tableId
    )
    if (tablesQuery.data && !stillValid) {
      navigate({
        search: (prev) => ({
          ...prev,
          page: 1,
          table_id: undefined,
        }),
      })
    }
  }, [appId, tableId, tablesQuery.data, navigate])

  return (
    <>
      <Header fixed>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>Meta Records</h2>
          <p className='text-muted-foreground'>
            Browse metadata records across tables (read-only in this release).
          </p>
        </div>

        <div className='flex flex-1 flex-col gap-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <Select
              value={appId || 'all'}
              onValueChange={(value) =>
                navigate({
                  search: (prev) => ({
                    ...prev,
                    page: 1,
                    app_id: value === 'all' ? undefined : value,
                    table_id: undefined,
                  }),
                })
              }
            >
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
              value={tableId || 'all'}
              onValueChange={(value) =>
                navigate({
                  search: (prev) => ({
                    ...prev,
                    page: 1,
                    table_id: value === 'all' ? undefined : value,
                  }),
                })
              }
            >
              <SelectTrigger className='w-[200px]'>
                <SelectValue placeholder='All Tables' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Tables</SelectItem>
                {(tablesQuery.data?.list ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
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
                      <TableHead key={header.id} colSpan={header.colSpan}>
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
                    <TableCell
                      colSpan={columns.length}
                      className='h-24 text-center'
                    >
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className='h-24 text-center text-destructive'
                    >
                      {(error as Error)?.message || 'Failed to load records.'}
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className='group/row'>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
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
                    <TableCell
                      colSpan={columns.length}
                      className='h-24 text-center'
                    >
                      No records found. Record writes land in a later release.
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
      </Main>

      <MetaRecordDetailDrawer
        recordId={detailId}
        open={!!detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
        tableNameById={tableNameById}
      />
    </>
  )
}
