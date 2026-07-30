import { useEffect } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { listApps } from '@/api/apps'
import { createConnection, updateConnection } from '@/api/connections'
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
import { PasswordInput } from '@/components/password-input'
import { SelectDropdown } from '@/components/select-dropdown'
import { type Connection } from '../data/schema'

const formSchema = z.object({
  app_id: z.string().min(1, 'App is required.'),
  name: z
    .string()
    .min(1, 'Name is required.')
    .max(64, 'Name must be at most 64 characters.'),
  type: z.enum(['mysql', 'postgresql']),
  host: z.string().min(1, 'Host is required.'),
  port: z.coerce
    .number({ invalid_type_error: 'Port must be a number.' })
    .int('Port must be an integer.')
    .min(1, 'Port must be between 1 and 65535.')
    .max(65535, 'Port must be between 1 and 65535.'),
  username: z.string().min(1, 'Username is required.'),
  password: z.string().optional(),
  database: z.string().min(1, 'Database is required.'),
  status: z.enum(['active', 'disabled']),
})

type ConnectionForm = z.infer<typeof formSchema>

type ConnectionsActionDialogProps = {
  currentRow?: Connection
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConnectionsActionDialog({
  currentRow,
  open,
  onOpenChange,
}: ConnectionsActionDialogProps) {
  const isEdit = !!currentRow
  const queryClient = useQueryClient()

  const appsQuery = useQuery({
    queryKey: ['apps', { page: 1, size: 100 }],
    queryFn: () => listApps({ page: 1, size: 100 }),
    enabled: open,
  })

  const form = useForm<ConnectionForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      app_id: '',
      name: '',
      type: 'mysql',
      host: '127.0.0.1',
      port: 3306,
      username: '',
      password: '',
      database: '',
      status: 'active',
    },
  })

  useEffect(() => {
    if (!open) return
    if (currentRow) {
      form.reset({
        app_id: currentRow.app_id,
        name: currentRow.name,
        type: currentRow.type,
        host: currentRow.host,
        port: currentRow.port,
        username: currentRow.username,
        password: '',
        database: currentRow.database,
        status: currentRow.status,
      })
    } else {
      form.reset({
        app_id: '',
        name: '',
        type: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        username: '',
        password: '',
        database: '',
        status: 'active',
      })
    }
  }, [open, currentRow, form])

  const mutation = useMutation({
    mutationFn: async (values: ConnectionForm) => {
      if (isEdit && currentRow) {
        return updateConnection(currentRow.id, {
          name: values.name,
          type: values.type,
          host: values.host,
          port: values.port,
          username: values.username,
          password: values.password?.trim()
            ? values.password
            : undefined,
          database: values.database,
          status: values.status,
        })
      }
      if (!values.password?.trim()) {
        throw new Error('Password is required.')
      }
      return createConnection({
        app_id: values.app_id,
        name: values.name,
        type: values.type,
        host: values.host,
        port: values.port,
        username: values.username,
        password: values.password,
        database: values.database,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] })
      toast.success(isEdit ? 'Connection updated.' : 'Connection created.')
      onOpenChange(false)
    },
    onError: (err) => {
      if (err instanceof AxiosError && err.response?.status === 409) {
        toast.error('A connection with this name already exists.')
        return
      }
      if (err instanceof Error && err.message === 'Password is required.') {
        form.setError('password', { message: 'Password is required.' })
        return
      }
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Request failed.'
      toast.error(message)
    },
  })

  const onSubmit = (values: ConnectionForm) => {
    if (!isEdit && !values.password?.trim()) {
      form.setError('password', { message: 'Password is required.' })
      return
    }
    mutation.mutate(values)
  }

  const appItems = (appsQuery.data?.list ?? []).map((app) => ({
    label: app.name,
    value: app.id,
  }))

  const currentAppName =
    appsQuery.data?.list.find((a) => a.id === currentRow?.app_id)?.name ||
    currentRow?.app_id ||
    '—'

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
            {isEdit ? 'Edit Connection' : 'Add Connection'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update connection details. Leave password blank to keep the current password.'
              : 'Create a new database connection. Click save when you are done.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id='connection-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='space-y-4'
          >
            {isEdit ? (
              <FormItem>
                <FormLabel>App</FormLabel>
                <Input value={currentAppName} disabled readOnly />
              </FormItem>
            ) : (
              <FormField
                control={form.control}
                name='app_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>App</FormLabel>
                    <SelectDropdown
                      isControlled
                      defaultValue={field.value || undefined}
                      onValueChange={field.onChange}
                      placeholder='Select application'
                      isPending={appsQuery.isLoading}
                      items={appItems}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder='compose-mysql'
                      autoComplete='off'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <SelectDropdown
                      isControlled
                      defaultValue={field.value}
                      onValueChange={(value) => {
                        field.onChange(value)
                        if (value === 'mysql' && form.getValues('port') === 5432) {
                          form.setValue('port', 3306)
                        }
                        if (
                          value === 'postgresql' &&
                          form.getValues('port') === 3306
                        ) {
                          form.setValue('port', 5432)
                        }
                      }}
                      placeholder='Select type'
                      items={[
                        { label: 'MySQL', value: 'mysql' },
                        { label: 'PostgreSQL', value: 'postgresql' },
                      ]}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='port'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Port</FormLabel>
                    <FormControl>
                      <Input type='number' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name='host'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Host</FormLabel>
                  <FormControl>
                    <Input placeholder='127.0.0.1' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className='grid grid-cols-2 gap-4'>
              <FormField
                control={form.control}
                name='username'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username</FormLabel>
                    <FormControl>
                      <Input autoComplete='off' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='password'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Password{isEdit ? ' (optional)' : ''}
                    </FormLabel>
                    <FormControl>
                      <PasswordInput
                        placeholder={isEdit ? 'Leave blank to keep' : '********'}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name='database'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Database</FormLabel>
                  <FormControl>
                    <Input placeholder='demo' {...field} />
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
            form='connection-form'
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
