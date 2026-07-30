import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { listConnections } from '@/api/connections'
import { generateModels, listConnectionTables } from '@/api/models'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ModelsGenerateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModelsGenerateDialog({
  open,
  onOpenChange,
}: ModelsGenerateDialogProps) {
  const queryClient = useQueryClient()
  const [connectionId, setConnectionId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)

  const connectionsQuery = useQuery({
    queryKey: ['connections', { page: 1, size: 100 }],
    queryFn: () => listConnections({ page: 1, size: 100 }),
    enabled: open,
  })

  const tablesQuery = useQuery({
    queryKey: ['connection-tables', connectionId],
    queryFn: () => listConnectionTables(connectionId),
    enabled: open && !!connectionId,
  })

  const tables = tablesQuery.data?.tables ?? []

  useEffect(() => {
    if (!open) {
      setConnectionId('')
      setSelected(new Set())
      setSelectAll(false)
    }
  }, [open])

  useEffect(() => {
    setSelected(new Set())
    setSelectAll(false)
  }, [connectionId])

  useEffect(() => {
    if (selectAll) {
      setSelected(new Set(tables.map((t) => t.name)))
    }
  }, [selectAll, tables])

  const connectionItems = useMemo(
    () => connectionsQuery.data?.list ?? [],
    [connectionsQuery.data?.list]
  )

  const mutation = useMutation({
    mutationFn: () => {
      if (!connectionId) {
        throw new Error('Connection is required.')
      }
      if (selectAll) {
        return generateModels(connectionId, { all: true })
      }
      const tablesArr = Array.from(selected)
      if (!tablesArr.length) {
        throw new Error('Select at least one table.')
      }
      return generateModels(connectionId, { tables: tablesArr })
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
      toast.success(
        `Generated ${result.generated.length} models (${result.skipped.length} skipped).`
      )
      onOpenChange(false)
    },
    onError: (err) => {
      if (err instanceof Error && !(err instanceof AxiosError)) {
        toast.error(err.message)
        return
      }
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to generate models.'
      toast.error(message)
    },
  })

  const toggleTable = (name: string, checked: boolean) => {
    setSelectAll(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(name)
      else next.delete(name)
      return next
    })
  }

  const canSubmit =
    !!connectionId &&
    (selectAll || selected.size > 0) &&
    !mutation.isPending &&
    !tablesQuery.isLoading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader className='text-start'>
          <DialogTitle>Generate Models</DialogTitle>
          <DialogDescription>
            Introspect tables from a database connection and upsert models.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label>Connection</Label>
            <Select
              value={connectionId || undefined}
              onValueChange={setConnectionId}
              disabled={connectionsQuery.isLoading}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Select connection' />
              </SelectTrigger>
              <SelectContent>
                {connectionItems.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {connectionId && (
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <Label>Tables</Label>
                <label className='flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={(v) => {
                      const checked = v === true
                      setSelectAll(checked)
                      if (!checked) setSelected(new Set())
                    }}
                  />
                  Select all
                </label>
              </div>

              {tablesQuery.isLoading ? (
                <p className='text-sm text-muted-foreground'>Loading tables...</p>
              ) : tablesQuery.isError ? (
                <p className='text-sm text-destructive'>
                  {(tablesQuery.error as Error)?.message ||
                    'Failed to load tables.'}
                </p>
              ) : tables.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  No tables found in this database.
                </p>
              ) : (
                <ScrollArea className='h-56 rounded-md border p-3'>
                  <div className='space-y-2'>
                    {tables.map((table) => {
                      const checked = selectAll || selected.has(table.name)
                      return (
                        <label
                          key={table.name}
                          className='flex cursor-pointer items-start gap-2 text-sm'
                        >
                          <Checkbox
                            checked={checked}
                            disabled={selectAll}
                            onCheckedChange={(v) =>
                              toggleTable(table.name, v === true)
                            }
                            className='mt-0.5'
                          />
                          <span>
                            <span className='font-medium'>{table.name}</span>
                            {table.comment ? (
                              <span className='block text-muted-foreground'>
                                {table.comment}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type='button'
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Generating...' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
