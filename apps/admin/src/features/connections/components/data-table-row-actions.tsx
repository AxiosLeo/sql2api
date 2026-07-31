import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { type Row } from '@tanstack/react-table'
import { useMutation } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { Cable, Copy, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { testConnection } from '@/api/connections'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type Connection } from '../data/schema'
import { useConnections } from './connections-provider'

type DataTableRowActionsProps = {
  row: Row<Connection>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const { setOpen, setCurrentRow } = useConnections()

  const testMutation = useMutation({
    mutationFn: () => testConnection(row.original.id),
    onSuccess: (result) => {
      if (result.ok) {
        const latency =
          typeof result.latency_ms === 'number'
            ? ` (${result.latency_ms}ms)`
            : ''
        toast.success(`Connected${latency}`)
        return
      }
      toast.error(result.message || 'Connection test failed.')
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Connection test failed.'
      toast.error(message)
    },
  })

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
        <DropdownMenuItem
          onClick={() => {
            setCurrentRow(row.original)
            setOpen('duplicate')
          }}
        >
          Duplicate
          <DropdownMenuShortcut>
            <Copy size={16} />
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={testMutation.isPending}
          onClick={() => testMutation.mutate()}
        >
          {testMutation.isPending ? 'Testing...' : 'Test Connection'}
          <DropdownMenuShortcut>
            <Cable size={16} />
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
