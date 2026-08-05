import { AlertTriangle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { deleteMetaTable } from '@/api/meta'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type MetaTable } from '../data/schema'

type MetaTablesDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: MetaTable
}

export function MetaTablesDeleteDialog({
  open,
  onOpenChange,
  currentRow,
}: MetaTablesDeleteDialogProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => deleteMetaTable(currentRow.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-tables'] })
      queryClient.invalidateQueries({ queryKey: ['meta-records'] })
      toast.success('Meta table deleted.')
      onOpenChange(false)
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to delete table.'
      toast.error(message)
    },
  })

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={() => mutation.mutate()}
      isLoading={mutation.isPending}
      title={
        <span className='text-destructive'>
          <AlertTriangle
            className='stroke-destructive me-1 inline-block'
            size={18}
          />{' '}
          Delete Meta Table
        </span>
      }
      desc={
        <p>
          Are you sure you want to delete table{' '}
          <span className='font-bold'>{currentRow.name}</span>? This will drop
          all physical cell shards and record index rows. This action cannot be
          undone.
        </p>
      }
      confirmText='Delete'
      destructive
    />
  )
}
