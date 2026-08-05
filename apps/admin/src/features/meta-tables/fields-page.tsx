import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  META_FIELD_TYPE_LABELS,
  deleteMetaField,
  getMetaTable,
  listMetaFields,
  type MetaFieldItem,
  type MetaFieldType,
} from '@/api/meta'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ruleToBadges } from '@/features/sqls/editor/rule-builder/parse-serialize'
import { MetaFieldDialog } from './components/meta-field-dialog'

function configSummary(field: MetaFieldItem): string {
  const c = field.config || {}
  if (
    field.type === 'single_select' ||
    field.type === 'multi_select'
  ) {
    const opts = c.options || []
    return opts.length ? `${opts.length} options` : 'No options'
  }
  if (field.type === 'datetime') {
    return c.format || '—'
  }
  if (
    field.type === 'one_way_link' ||
    field.type === 'two_way_link'
  ) {
    const multi = c.multiple !== false ? 'multiple' : 'single'
    const scope =
      c.link_scope === 'filter'
        ? `${c.filters?.length || 0} filters`
        : 'all'
    return `target=${c.target_table_id || '—'} · ${multi} · ${scope}`
  }
  if (field.type === 'attachment') {
    return c.multiple !== false ? 'multiple files' : 'single file'
  }
  return '—'
}

type MetaTableFieldsPageProps = {
  tableId: string
}

export function MetaTableFieldsPage({ tableId }: MetaTableFieldsPageProps) {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [currentRow, setCurrentRow] = useState<MetaFieldItem | null>(null)
  const [deleteRow, setDeleteRow] = useState<MetaFieldItem | null>(null)

  const tableQuery = useQuery({
    queryKey: ['meta-tables', tableId],
    queryFn: () => getMetaTable(tableId),
  })

  const fieldsQuery = useQuery({
    queryKey: ['meta-fields', tableId],
    queryFn: () => listMetaFields(tableId),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMetaField(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-fields', tableId] })
      queryClient.invalidateQueries({ queryKey: ['meta-tables'] })
      toast.success('Field deleted.')
      setDeleteRow(null)
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to delete field.'
      toast.error(message)
    },
  })

  const fields = useMemo(
    () => fieldsQuery.data?.list ?? [],
    [fieldsQuery.data?.list]
  )

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
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div className='space-y-2'>
            <Button variant='ghost' size='sm' asChild className='-ms-2 px-2'>
              <Link to='/meta-tables'>
                <ArrowLeft className='me-1 size-4' />
                Back to Tables
              </Link>
            </Button>
            {tableQuery.isLoading ? (
              <Skeleton className='h-8 w-48' />
            ) : (
              <div>
                <h2 className='text-2xl font-bold tracking-tight'>
                  {tableQuery.data?.name || 'Fields'}
                </h2>
                <p className='text-muted-foreground'>
                  {tableQuery.data?.description ||
                    'Manage dynamic fields for this meta table.'}
                  {tableQuery.data
                    ? ` · ${tableQuery.data.field_count} fields · ${tableQuery.data.record_count} records`
                    : ''}
                </p>
              </div>
            )}
          </div>
          <Button
            className='space-x-1'
            onClick={() => {
              setCurrentRow(null)
              setDialogOpen(true)
            }}
          >
            <span>Add Field</span> <Plus size={18} />
          </Button>
        </div>

        <div className='overflow-hidden rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Validator</TableHead>
                <TableHead>Config</TableHead>
                <TableHead>System</TableHead>
                <TableHead className='w-16' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fieldsQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className='h-24 text-center'>
                    Loading...
                  </TableCell>
                </TableRow>
              ) : fields.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className='h-24 text-center'>
                    No fields found.
                  </TableCell>
                </TableRow>
              ) : (
                fields.map((field) => {
                  const badges = ruleToBadges(field.validator || '')
                  return (
                    <TableRow key={field.id}>
                      <TableCell className='font-medium'>{field.name}</TableCell>
                      <TableCell>
                        <Badge variant='outline'>
                          {META_FIELD_TYPE_LABELS[
                            field.type as MetaFieldType
                          ] || field.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-wrap gap-1'>
                          {badges.length
                            ? badges.map((b) => (
                                <Badge key={b} variant='secondary'>
                                  {b}
                                </Badge>
                              ))
                            : '—'}
                        </div>
                      </TableCell>
                      <TableCell className='text-muted-foreground max-w-56 truncate text-sm'>
                        {configSummary(field)}
                      </TableCell>
                      <TableCell>
                        {field.is_system ? (
                          <Badge>system</Badge>
                        ) : (
                          <span className='text-muted-foreground'>—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!field.is_system && (
                          <div className='flex gap-1'>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => {
                                setCurrentRow(field)
                                setDialogOpen(true)
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='text-destructive'
                              onClick={() => setDeleteRow(field)}
                            >
                              <Trash2 className='size-4' />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Main>

      {tableQuery.data && (
        <MetaFieldDialog
          tableId={tableId}
          appId={tableQuery.data.app_id}
          currentRow={currentRow || undefined}
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) setCurrentRow(null)
          }}
        />
      )}

      {deleteRow && (
        <ConfirmDialog
          open={!!deleteRow}
          onOpenChange={(open) => {
            if (!open) setDeleteRow(null)
          }}
          handleConfirm={() => deleteMutation.mutate(deleteRow.id)}
          isLoading={deleteMutation.isPending}
          title='Delete Field'
          desc={
            <p>
              Delete field <span className='font-bold'>{deleteRow.name}</span>?
              Cell values for this field will be removed from all shards.
              {deleteRow.type === 'two_way_link'
                ? ' The reverse link field will also be deleted.'
                : ''}
            </p>
          }
          confirmText='Delete'
          destructive
        />
      )}
    </>
  )
}
