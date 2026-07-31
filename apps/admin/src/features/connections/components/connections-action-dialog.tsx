import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { Cable, Database } from 'lucide-react'
import { toast } from 'sonner'
import { listApps } from '@/api/apps'
import {
  createConnection,
  probeConnection,
  updateConnection,
  type ListDatabasesResult,
  type TestConnectionResult,
} from '@/api/connections'
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
import {
  DATASOURCE_DEFAULT_PORTS,
  DATASOURCE_SELECT_ITEMS,
  DATASOURCE_TYPES,
  isDatasourceType,
  supportsDatabaseListing,
  type DatasourceType,
} from '@/lib/datasource'
import { type Connection } from '../data/schema'

const formSchema = z.object({
  app_id: z.string().min(1, 'App is required.'),
  name: z
    .string()
    .min(1, 'Name is required.')
    .max(64, 'Name must be at most 64 characters.'),
  type: z.enum(DATASOURCE_TYPES),
  host: z.string().min(1, 'Host is required.'),
  port: z.coerce
    .number()
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

function isTestResult(
  data: TestConnectionResult | ListDatabasesResult
): data is TestConnectionResult {
  return 'ok' in data
}

export function ConnectionsActionDialog({
  currentRow,
  open,
  onOpenChange,
}: ConnectionsActionDialogProps) {
  const isEdit = !!currentRow
  const queryClient = useQueryClient()
  const [probeOk, setProbeOk] = useState(false)
  const [databases, setDatabases] = useState<string[]>([])

  const appsQuery = useQuery({
    queryKey: ['apps', { page: 1, size: 100 }],
    queryFn: () => listApps({ page: 1, size: 100 }),
    enabled: open,
  })

  const form = useForm<ConnectionForm>({
    // zod v4 coerce.number input typing conflicts with RHF Resolver generics
    resolver: zodResolver(formSchema) as never,
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
    setProbeOk(false)
    setDatabases([])
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

  const watchedType = form.watch('type')
  const watchedHost = form.watch('host')
  const watchedPort = form.watch('port')
  const watchedUsername = form.watch('username')
  const watchedPassword = form.watch('password')

  useEffect(() => {
    setProbeOk(false)
    setDatabases([])
  }, [watchedType, watchedHost, watchedPort, watchedUsername, watchedPassword])

  const buildProbeBody = (
    values: ConnectionForm,
    action: 'test' | 'databases'
  ) => {
    const password = values.password?.trim() || undefined
    return {
      type: values.type,
      host: values.host,
      port: values.port,
      username: values.username,
      password,
      database: values.database || undefined,
      connection_id:
        !password && isEdit && currentRow ? currentRow.id : undefined,
      action,
    }
  }

  const probeMutation = useMutation({
    mutationFn: async (action: 'test' | 'databases') => {
      const values = form.getValues()
      if (!isEdit && !values.password?.trim()) {
        throw new Error('Password is required.')
      }
      if (
        !values.host?.trim() ||
        !values.username?.trim() ||
        !values.type
      ) {
        throw new Error('Host, type, and username are required.')
      }
      return probeConnection(buildProbeBody(values, action))
    },
    onSuccess: (data, action) => {
      if (action === 'test') {
        if (!isTestResult(data)) return
        if (data.ok) {
          setProbeOk(true)
          const latency =
            typeof data.latency_ms === 'number'
              ? ` (${data.latency_ms}ms)`
              : ''
          toast.success(`Connected${latency}`)
          return
        }
        setProbeOk(false)
        setDatabases([])
        toast.error(data.message || 'Connection test failed.')
        return
      }
      if (isTestResult(data)) return
      if (!data.supported) {
        toast.message(data.message || 'Database listing is not supported.')
        setDatabases([])
        return
      }
      setDatabases(data.databases)
      if (data.databases.length === 0) {
        toast.message(data.message || 'No databases returned.')
        return
      }
      toast.success(`Loaded ${data.databases.length} database(s).`)
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'Password is required.') {
        form.setError('password', { message: 'Password is required.' })
        return
      }
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : err instanceof Error
            ? err.message
            : 'Probe failed.'
      toast.error(message)
    },
  })

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

  const handleTypeChange = (value: string) => {
    const prevType = form.getValues('type') as DatasourceType
    form.setValue('type', value as DatasourceType, { shouldValidate: true })
    if (!isDatasourceType(value)) return
    const currentPort = form.getValues('port')
    const prevDefault = DATASOURCE_DEFAULT_PORTS[prevType]
    if (currentPort === prevDefault) {
      form.setValue('port', DATASOURCE_DEFAULT_PORTS[value])
    }
  }

  const canListDatabases =
    probeOk && supportsDatabaseListing(watchedType)

  const databaseListId = 'connection-database-options'

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        if (!state) {
          form.reset()
          setProbeOk(false)
          setDatabases([])
        }
        onOpenChange(state)
      }}
    >
      <DialogContent className='flex max-h-[90vh] w-full flex-col sm:max-w-3xl'>
        <DialogHeader className='text-start'>
          <DialogTitle>
            {isEdit ? 'Edit Connection' : 'Add Connection'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update connection details. Leave password blank to keep the current password. Use Test Connection to verify without saving.'
              : 'Create a new database connection. Test connectivity before saving — testing never creates a record.'}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id='connection-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='min-h-0 flex-1 space-y-4 overflow-y-auto pr-1'
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
                      onValueChange={handleTypeChange}
                      placeholder='Select type'
                      items={DATASOURCE_SELECT_ITEMS}
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
                  <FormLabel>
                    {watchedType === 'oracle' ? 'Service Name' : 'Database'}
                  </FormLabel>
                  <div className='flex gap-2'>
                    <FormControl>
                      <Input
                        list={
                          databases.length > 0 ? databaseListId : undefined
                        }
                        placeholder={
                          watchedType === 'oracle' ? 'ORCLPDB1' : 'demo'
                        }
                        {...field}
                      />
                    </FormControl>
                    {canListDatabases && (
                      <Button
                        type='button'
                        variant='outline'
                        disabled={probeMutation.isPending}
                        onClick={() => probeMutation.mutate('databases')}
                      >
                        <Database className='mr-1 size-4' />
                        {probeMutation.isPending &&
                        probeMutation.variables === 'databases'
                          ? 'Loading...'
                          : 'Load DBs'}
                      </Button>
                    )}
                  </div>
                  {databases.length > 0 && (
                    <datalist id={databaseListId}>
                      {databases.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  )}
                  {watchedType === 'oracle' && (
                    <p className='text-muted-foreground text-xs'>
                      Oracle uses a Service Name; catalog listing is not
                      available.
                    </p>
                  )}
                  {probeOk &&
                    supportsDatabaseListing(watchedType) &&
                    databases.length === 0 && (
                      <p className='text-muted-foreground text-xs'>
                        Connection OK. Click Load DBs to pick from a list, or
                        type a name.
                      </p>
                    )}
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
        <DialogFooter className='gap-2 sm:justify-between'>
          <Button
            type='button'
            variant='outline'
            disabled={probeMutation.isPending || mutation.isPending}
            onClick={() => probeMutation.mutate('test')}
          >
            <Cable className='mr-1 size-4' />
            {probeMutation.isPending && probeMutation.variables === 'test'
              ? 'Testing...'
              : 'Test Connection'}
          </Button>
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
