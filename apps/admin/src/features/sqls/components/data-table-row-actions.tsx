import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { type Row } from '@tanstack/react-table'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { Ban, CheckCircle2, Copy, FileJson, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getSqlOpenApiDoc, updateSql } from '@/api/sqls'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type Sql } from '../data/schema'
import { useSqls } from './sqls-provider'

type DataTableRowActionsProps = {
  row: Row<Sql>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const { setOpen, setCurrentRow } = useSqls()
  const queryClient = useQueryClient()
  const status = row.original.status
  const isEnabled = status === 'enabled'
  const isDraft = status === 'draft'

  const statusMutation = useMutation({
    mutationFn: () =>
      updateSql(row.original.id, {
        status: isEnabled ? 'disabled' : 'enabled',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sqls'] })
      toast.success(
        isEnabled
          ? 'SQL API disabled.'
          : isDraft
            ? 'SQL API enabled.'
            : 'SQL API enabled.'
      )
    },
    onError: (err) => {
      if (err instanceof AxiosError && err.response?.status === 422) {
        toast.error(
          'Review required before enabling. Open Edit and run Review first.'
        )
        return
      }
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to update status.'
      toast.error(message)
    },
  })

  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(row.original.endpoint)
      toast.success('Endpoint copied.')
    } catch {
      toast.error('Failed to copy endpoint.')
    }
  }

  const copyApiDoc = async () => {
    try {
      const spec = await getSqlOpenApiDoc(row.original.id)
      await navigator.clipboard.writeText(JSON.stringify(spec, null, 2))
      toast.success('API Doc copied.')
    } catch (err) {
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to copy API Doc.'
      toast.error(message)
    }
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          className='data-[state=open]:bg-muted flex h-8 w-8 p-0'
        >
          <DotsHorizontalIcon className='h-4 w-4' />
          <span className='sr-only'>Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-[200px]'>
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(row.original)
            setOpen('edit')
          }}
        >
          Edit
          <DropdownMenuShortcut>
            <Pencil size={16} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyEndpoint}>
          Copy Endpoint
          <DropdownMenuShortcut>
            <Copy size={16} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copyApiDoc}>
          Copy API Doc
          <DropdownMenuShortcut>
            <FileJson size={16} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={statusMutation.isPending}
          onClick={() => statusMutation.mutate()}
        >
          {isEnabled ? 'Disable' : 'Enable'}
          <DropdownMenuShortcut>
            {isEnabled ? <Ban size={16} /> : <CheckCircle2 size={16} />}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(row.original)
            setOpen('delete')
          }}
          className='text-red-500!'
        >
          Delete
          <DropdownMenuShortcut>
            <Trash2 size={16} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
