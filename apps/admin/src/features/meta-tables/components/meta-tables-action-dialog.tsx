import { useEffect } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { listApps } from '@/api/apps'
import { createMetaTable, updateMetaTable } from '@/api/meta'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SelectDropdown } from '@/components/select-dropdown'
import { type MetaTable } from '../data/schema'

const formSchema = z.object({
  app_id: z.string().min(1, 'App is required.'),
  name: z
    .string()
    .min(1, 'Name is required.')
    .max(128, 'Name must be at most 128 characters.'),
  description: z.string().optional(),
  status: z.enum(['active', 'disabled']),
})

type TableForm = z.infer<typeof formSchema>

type MetaTablesActionDialogProps = {
  currentRow?: MetaTable
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MetaTablesActionDialog({
  currentRow,
  open,
  onOpenChange,
}: MetaTablesActionDialogProps) {
  const isEdit = !!currentRow
  const queryClient = useQueryClient()

  const appsQuery = useQuery({
    queryKey: ['apps', { page: 1, size: 100 }],
    queryFn: () => listApps({ page: 1, size: 100 }),
    enabled: open,
  })

  const form = useForm<TableForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      app_id: '',
      name: '',
      description: '',
      status: 'active',
    },
  })

  useEffect(() => {
    if (!open) return
    if (currentRow) {
      form.reset({
        app_id: currentRow.app_id,
        name: currentRow.name,
        description: currentRow.description || '',
        status: currentRow.status,
      })
    } else {
      form.reset({
        app_id: '',
        name: '',
        description: '',
        status: 'active',
      })
    }
  }, [open, currentRow, form])

  const mutation = useMutation({
    mutationFn: async (values: TableForm) => {
      if (isEdit && currentRow) {
        return updateMetaTable(currentRow.id, {
          name: values.name,
          description: values.description || '',
          status: values.status,
        })
      }
      return createMetaTable({
        app_id: values.app_id,
        name: values.name,
        description: values.description || '',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-tables'] })
      toast.success(isEdit ? 'Table updated.' : 'Table created.')
      onOpenChange(false)
    },
    onError: (err) => {
      if (err instanceof AxiosError && err.response?.status === 409) {
        toast.error('A table with this name already exists in the app.')
        return
      }
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Request failed.'
      toast.error(message)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        if (!state) form.reset()
        onOpenChange(state)
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader className='text-start'>
          <DialogTitle>
            {isEdit ? 'Edit Meta Table' : 'Add Meta Table'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update meta table details. Click save when you are done.'
              : 'Create a meta table under an application. System fields and the first cell shard are created automatically.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id='meta-table-form'
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className='space-y-4'
          >
            <FormField
              control={form.control}
              name='app_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>App</FormLabel>
                  <SelectDropdown
                    isControlled
                    disabled={isEdit}
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                    placeholder='Select app'
                    items={(appsQuery.data?.list ?? []).map((app) => ({
                      label: app.name,
                      value: app.id,
                    }))}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='customers'
                      autoComplete='off'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Optional description'
                      className='min-h-20'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isEdit && (
              <FormField
                control={form.control}
                name='status'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <SelectDropdown
                      isControlled
                      defaultValue={field.value}
                      onValueChange={field.onChange}
                      placeholder='Select status'
                      items={[
                        { label: 'Active', value: 'active' },
                        { label: 'Disabled', value: 'disabled' },
                      ]}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </form>
        </Form>
        <DialogFooter>
          <Button
            type='submit'
            form='meta-table-form'
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
