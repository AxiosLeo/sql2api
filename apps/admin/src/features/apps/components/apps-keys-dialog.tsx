import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { Copy, KeyRound, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  createAppKey,
  listAppKeys,
  revokeAppKey,
  type CreateApiKeyResult,
} from '@/api/apps'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { type App } from '../data/schema'

type AppsKeysDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: App
}

export function AppsKeysDialog({
  open,
  onOpenChange,
  currentRow,
}: AppsKeysDialogProps) {
  const queryClient = useQueryClient()
  const [keyName, setKeyName] = useState('default')
  const [created, setCreated] = useState<CreateApiKeyResult | null>(null)

  const keysQuery = useQuery({
    queryKey: ['apps', currentRow.id, 'keys'],
    queryFn: () => listAppKeys(currentRow.id),
    enabled: open,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createAppKey(currentRow.id, { name: keyName.trim() || 'default' }),
    onSuccess: (result) => {
      setCreated(result)
      queryClient.invalidateQueries({ queryKey: ['apps', currentRow.id, 'keys'] })
      toast.success('API key created. Copy the token now — it is shown only once.')
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to create API key.'
      toast.error(message)
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeAppKey(currentRow.id, keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps', currentRow.id, 'keys'] })
      toast.success('API key revoked.')
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to revoke API key.'
      toast.error(message)
    },
  })

  const keys = keysQuery.data?.list ?? []

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token)
      toast.success('Token copied to clipboard.')
    } catch {
      toast.error('Failed to copy token.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        if (!state) {
          setCreated(null)
          setKeyName('default')
        }
        onOpenChange(state)
      }}
    >
      <DialogContent className='flex max-h-[90vh] w-full flex-col sm:max-w-4xl'>
        <DialogHeader className='text-start'>
          <DialogTitle>Manage API Keys</DialogTitle>
          <DialogDescription>
            API keys for <span className='font-medium'>{currentRow.name}</span>.
            The plaintext token is shown only once when created.
          </DialogDescription>
        </DialogHeader>

        <div className='min-w-0 space-y-4 overflow-x-hidden'>
          {created && (
            <div className='rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30'>
              <p className='mb-2 text-sm font-medium'>
                New token (copy now — it will not be shown again):
              </p>
              <div className='flex min-w-0 items-center gap-2'>
                <code className='bg-background min-w-0 flex-1 overflow-x-auto rounded border px-2 py-1 text-xs'>
                  {created.token}
                </code>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  className='shrink-0'
                  onClick={() => copyToken(created.token)}
                >
                  <Copy className='size-4' />
                  Copy
                </Button>
              </div>
            </div>
          )}

          <div className='flex flex-wrap items-end gap-2'>
            <div className='min-w-40 flex-1 space-y-1'>
              <Label htmlFor='key-name'>Key name</Label>
              <Input
                id='key-name'
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder='default'
              />
            </div>
            <Button
              type='button'
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className='size-4 animate-spin' />
              ) : (
                <KeyRound className='size-4' />
              )}
              Create Key
            </Button>
          </div>

          <div className='w-full min-w-0 overflow-x-auto rounded-md border'>
            <Table className='min-w-[720px]'>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='whitespace-nowrap'>Last used</TableHead>
                  <TableHead className='whitespace-nowrap'>Created</TableHead>
                  <TableHead className='w-[100px] text-end'>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keysQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className='h-20 text-center'>
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className='h-20 text-center'>
                      No API keys yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className='font-medium'>{key.name}</TableCell>
                      <TableCell>
                        <code className='text-xs'>{key.prefix}…</code>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant='outline'
                          className={cn(
                            'capitalize',
                            key.status === 'active'
                              ? 'border-teal-300 bg-teal-100/50'
                              : 'text-muted-foreground'
                          )}
                        >
                          {key.status}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-muted-foreground whitespace-nowrap text-sm'>
                        {key.last_used_at
                          ? new Date(key.last_used_at).toLocaleString()
                          : '—'}
                      </TableCell>
                      <TableCell className='text-muted-foreground whitespace-nowrap text-sm'>
                        {new Date(key.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className='text-end'>
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          className='text-destructive'
                          disabled={
                            key.status === 'disabled' || revokeMutation.isPending
                          }
                          onClick={() => revokeMutation.mutate(key.id)}
                        >
                          <Trash2 className='size-4' />
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
