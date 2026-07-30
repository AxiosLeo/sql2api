import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { deleteSql } from '@/api/sqls'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type Sql } from '../data/schema'

type SqlsDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Sql
}

export function SqlsDeleteDialog({
  open,
  onOpenChange,
  currentRow,
}: SqlsDeleteDialogProps) {
  const [value, setValue] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => deleteSql(currentRow.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sqls'] })
      toast.success('SQL API deleted.')
      setValue('')
      onOpenChange(false)
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to delete SQL API.'
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
          Delete SQL API
        </span>
      }
      desc={
        <div className='space-y-4'>
          <p className='mb-2'>
            Are you sure you want to delete{' '}
            <span className='font-bold'>{currentRow.name}</span>?
            <br />
            The invoke endpoint{' '}
            <code className='rounded bg-muted px-1 text-xs'>
              {currentRow.endpoint}
            </code>{' '}
            will stop working. This cannot be undone.
          </p>

          <Label className='my-2'>
            SQL API name:
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder='Enter SQL API name to confirm.'
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
