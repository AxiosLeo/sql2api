import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { Loader2, RefreshCw, RotateCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  getAiSettings,
  resetAiSettings,
  testAiConnection,
  updateAiSettings,
  type AIProvider,
} from '@/api/settings'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const formSchema = z.object({
  provider: z.enum(['local', 'ollama']),
  model_path: z.string().optional(),
  ollama_base_url: z.string().optional(),
  ollama_model: z.string().optional(),
  ollama_timeout_ms: z.coerce.number().int().min(1000).optional(),
})

type SettingsForm = z.infer<typeof formSchema>

export function SystemSettings() {
  const queryClient = useQueryClient()
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [testedVersion, setTestedVersion] = useState<string | null>(null)

  const settingsQuery = useQuery({
    queryKey: ['settings', 'ai'],
    queryFn: getAiSettings,
  })

  const form = useForm<SettingsForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: 'local',
      model_path: '',
      ollama_base_url: 'http://127.0.0.1:11434',
      ollama_model: 'gpt-oss:20b',
      ollama_timeout_ms: 120000,
    },
  })

  useEffect(() => {
    const data = settingsQuery.data
    if (!data) return
    const online = data.online
    const eff = data.effective
    form.reset({
      provider: (online?.provider || eff.provider) as AIProvider,
      model_path: online?.model_path ?? eff.model_path ?? '',
      ollama_base_url:
        online?.ollama?.base_url || eff.ollama.base_url || 'http://127.0.0.1:11434',
      ollama_model: online?.ollama?.model || eff.ollama.model || 'gpt-oss:20b',
      ollama_timeout_ms:
        online?.ollama?.timeout_ms || eff.ollama.timeout_ms || 120000,
    })
    if (eff.ollama.model) {
      setModelOptions((prev) =>
        prev.includes(eff.ollama.model) ? prev : [eff.ollama.model, ...prev]
      )
    }
  }, [settingsQuery.data, form])

  const provider = form.watch('provider')

  const saveMutation = useMutation({
    mutationFn: (values: SettingsForm) =>
      updateAiSettings({
        provider: values.provider,
        model_path: values.model_path?.trim() || undefined,
        ollama: {
          base_url: values.ollama_base_url?.trim() || undefined,
          model: values.ollama_model?.trim() || undefined,
          timeout_ms: values.ollama_timeout_ms,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'ai'] })
      toast.success('AI settings saved. Changes take effect immediately.')
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to save settings.'
      toast.error(message)
    },
  })

  const resetMutation = useMutation({
    mutationFn: resetAiSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'ai'] })
      toast.success('Online AI settings cleared. Using environment defaults.')
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to reset settings.'
      toast.error(message)
    },
  })

  const testMutation = useMutation({
    mutationFn: () =>
      testAiConnection({
        base_url: form.getValues('ollama_base_url')?.trim() || undefined,
      }),
    onSuccess: (result) => {
      setTestedVersion(result.version || 'ok')
      setModelOptions(result.models || [])
      const current = form.getValues('ollama_model')?.trim()
      if (
        result.models.length > 0 &&
        (!current || !result.models.includes(current))
      ) {
        form.setValue('ollama_model', result.models[0], { shouldDirty: true })
      }
      toast.success(
        `Connected to Ollama${result.version ? ` v${result.version}` : ''} (${result.models.length} model(s)).`
      )
    },
    onError: (err) => {
      setTestedVersion(null)
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Connection test failed.'
      toast.error(message)
    },
  })

  const onSubmit = (values: SettingsForm) => {
    saveMutation.mutate(values)
  }

  const onReset = () => {
    if (
      !window.confirm(
        'Clear online AI settings and fall back to environment variables?'
      )
    ) {
      return
    }
    resetMutation.mutate()
  }

  const effective = settingsQuery.data?.effective
  const source = settingsQuery.data?.source

  return (
    <>
      <Header fixed>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>System Settings</h2>
          <p className='text-muted-foreground'>
            Configure the AI provider used for SQL generation and review. Online
            settings override environment variables and take effect immediately.
          </p>
        </div>

        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Effective configuration</CardTitle>
            <CardDescription>
              Current runtime values after applying online overrides.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-wrap items-center gap-2 text-sm'>
            {settingsQuery.isLoading ? (
              <span className='text-muted-foreground'>Loading…</span>
            ) : (
              <>
                <Badge
                  variant='outline'
                  className={cn(
                    source === 'online'
                      ? 'border-teal-300 bg-teal-50/50 text-teal-900 dark:text-teal-200'
                      : 'border-neutral-300'
                  )}
                >
                  {source === 'online' ? 'Online config' : 'Environment'}
                </Badge>
                <Badge variant='secondary' className='capitalize'>
                  {effective?.provider || '—'}
                </Badge>
                {effective?.provider === 'ollama' ? (
                  <span className='text-muted-foreground'>
                    {effective.ollama.model} @ {effective.ollama.base_url}
                  </span>
                ) : (
                  <span className='text-muted-foreground'>
                    {effective?.model_path || '(no local model path)'}
                  </span>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>AI provider</CardTitle>
            <CardDescription>
              Choose local GGUF (node-llama-cpp) or a remote Ollama service.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-6'
              >
                <FormField
                  control={form.control}
                  name='provider'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provider</FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className='grid gap-3 sm:grid-cols-2'
                        >
                          <Label
                            htmlFor='provider-local'
                            className={cn(
                              'flex cursor-pointer items-start gap-3 rounded-md border p-3',
                              field.value === 'local' && 'border-primary'
                            )}
                          >
                            <RadioGroupItem
                              id='provider-local'
                              value='local'
                              className='mt-1'
                            />
                            <div>
                              <div className='font-medium'>Local model</div>
                              <p className='text-xs text-muted-foreground'>
                                Offline GGUF via node-llama-cpp
                              </p>
                            </div>
                          </Label>
                          <Label
                            htmlFor='provider-ollama'
                            className={cn(
                              'flex cursor-pointer items-start gap-3 rounded-md border p-3',
                              field.value === 'ollama' && 'border-primary'
                            )}
                          >
                            <RadioGroupItem
                              id='provider-ollama'
                              value='ollama'
                              className='mt-1'
                            />
                            <div>
                              <div className='font-medium'>Ollama</div>
                              <p className='text-xs text-muted-foreground'>
                                Private / remote Ollama HTTP API
                              </p>
                            </div>
                          </Label>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {provider === 'local' ? (
                  <FormField
                    control={form.control}
                    name='model_path'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model path</FormLabel>
                        <FormControl>
                          <Input
                            placeholder='Leave empty to use LLAMA_MODEL_PATH env'
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Absolute or relative path to a GGUF file. Empty keeps
                          the environment variable.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className='space-y-4 rounded-md border p-4'>
                    <FormField
                      control={form.control}
                      name='ollama_base_url'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Base URL</FormLabel>
                          <div className='flex flex-col gap-2 sm:flex-row'>
                            <FormControl>
                              <Input
                                placeholder='http://127.0.0.1:11434'
                                {...field}
                              />
                            </FormControl>
                            <Button
                              type='button'
                              variant='secondary'
                              disabled={testMutation.isPending}
                              onClick={() => testMutation.mutate()}
                            >
                              {testMutation.isPending ? (
                                <Loader2 className='me-2 h-4 w-4 animate-spin' />
                              ) : (
                                <RefreshCw className='me-2 h-4 w-4' />
                              )}
                              Test Connection
                            </Button>
                          </div>
                          {testedVersion ? (
                            <FormDescription>
                              Last test OK
                              {testedVersion !== 'ok'
                                ? ` (v${testedVersion})`
                                : ''}
                              .
                            </FormDescription>
                          ) : null}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='ollama_model'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model</FormLabel>
                          {modelOptions.length > 0 ? (
                            <Select
                              value={field.value || undefined}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder='Select model' />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {modelOptions.map((name) => (
                                  <SelectItem key={name} value={name}>
                                    {name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <FormControl>
                              <Input
                                placeholder='gpt-oss:20b'
                                {...field}
                              />
                            </FormControl>
                          )}
                          <FormDescription>
                            Run Test Connection to list models from Ollama, or
                            type a model name manually before testing.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='ollama_timeout_ms'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Timeout (ms)</FormLabel>
                          <FormControl>
                            <Input type='number' min={1000} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <div className='flex flex-wrap gap-2'>
                  <Button
                    type='submit'
                    disabled={saveMutation.isPending || settingsQuery.isLoading}
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className='me-2 h-4 w-4 animate-spin' />
                    ) : (
                      <Save className='me-2 h-4 w-4' />
                    )}
                    Save
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={resetMutation.isPending}
                    onClick={onReset}
                  >
                    {resetMutation.isPending ? (
                      <Loader2 className='me-2 h-4 w-4 animate-spin' />
                    ) : (
                      <RotateCcw className='me-2 h-4 w-4' />
                    )}
                    Reset to environment
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
