import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { deleteApp } from '@/api/apps'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type App } from '../data/schema'

type AppsDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: App
}

export function AppsDeleteDialog({
  open,
  onOpenChange,
  currentRow,
}: AppsDeleteDialogProps) {
  const [value, setValue] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => deleteApp(currentRow.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] })
      toast.success('Application deleted.')
      setValue('')
      onOpenChange(false)
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to delete application.'
      toast.error(message)
    },
  })

  const handleDelete = () => {
    if (value.trim() !== currentRow.name) return
    mutation.mutate()
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(state) => {
        if (!state) setValue('')
        onOpenChange(state)
      }}
      handleConfirm={handleDelete}
      disabled={value.trim() !== currentRow.name}
      isLoading={mutation.isPending}
      title={
        <span className='text-destructive'>
          <AlertTriangle
            className='stroke-destructive me-1 inline-block'
            size={18}
          />{' '}
          Delete Application
        </span>
      }
      desc={
        <div className='space-y-4'>
          <p className='mb-2'>
            Are you sure you want to delete{' '}
            <span className='font-bold'>{currentRow.name}</span>?
            <br />
            This will cascade delete API keys, connections, models, and SQLs
            under this application. This cannot be undone.
          </p>

          <Label className='my-2'>
            Application name:
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder='Enter application name to confirm.'
            />
          </Label>

          <Alert variant='destructive'>
            <AlertTitle>Warning!</AlertTitle>
            <AlertDescription>
              Please be careful, this operation cannot be rolled back.
            </AlertDescription>
          </Alert>
        </div>
      }
      confirmText='Delete'
      destructive
    />
  )
}
