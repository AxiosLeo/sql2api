import { AlertTriangle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { deleteModel } from '@/api/models'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type Model } from '../data/schema'

type ModelsDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Model
}

export function ModelsDeleteDialog({
  open,
  onOpenChange,
  currentRow,
}: ModelsDeleteDialogProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => deleteModel(currentRow.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
      toast.success('Model deleted.')
      onOpenChange(false)
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to delete model.'
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
          Delete Model
        </span>
      }
      desc={
        <p>
          Are you sure you want to delete model{' '}
          <span className='font-bold'>{currentRow.table_name}</span>? You can
          regenerate it from the connection at any time.
        </p>
      }
      confirmText='Delete'
      destructive
    />
  )
}
