import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import {
  AlignLeft,
  ArrowLeft,
  Loader2,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { listConnections } from '@/api/connections'
import { listModels } from '@/api/models'
import {
  applySqlReview,
  createSql,
  generateSqlMock,
  generateSqlName,
  generateSqlStream,
  GenerateSqlStreamError,
  reviewSql,
  updateSql,
  type GenerateProgressEvent,
  type ReviewIssue,
  type ReviewResult,
  type SqlItem,
} from '@/api/sqls'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { SqlEditor, type SqlDialect } from '@/components/sql-editor'
import { ThemeSwitch } from '@/components/theme-switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { datasourceProtocol } from '@/lib/datasource'
import { formatSql } from '@/lib/format-sql'
import { AiGeneratePanel } from './ai-generate-panel'
import { MockDataCard } from './mock-data-card'
import { ParamsCard } from './params-card'
import { ReviewCard } from './review-card'
import {
  DEFAULT_MOCK_DATA,
  formSchema,
  formatMockDataJson,
  type AiMeta,
  type SqlEditorForm,
} from './types'

function extractReviewResult(err: unknown): ReviewResult | null {
  if (!(err instanceof AxiosError)) return null
  const status = err.response?.status
  if (status !== 422) return null
  const data = err.response?.data as
    | {
        data?: ReviewResult
        passed?: boolean
        issues?: ReviewResult['issues']
        sql_type?: ReviewResult['sql_type']
        method?: ReviewResult['method']
      }
    | undefined
  if (!data) return null
  if (typeof data.passed === 'boolean' && Array.isArray(data.issues)) {
    return {
      passed: data.passed,
      issues: data.issues,
      sql_type: data.sql_type,
      method: data.method,
    }
  }
  if (
    data.data &&
    typeof data.data.passed === 'boolean' &&
    Array.isArray(data.data.issues)
  ) {
    return data.data
  }
  return null
}

function mapParamsToForm(
  params: SqlItem['params'] | undefined
): SqlEditorForm['params'] {
  return (params || []).map((p) => ({
    name: p.name,
    rule: p.rule,
    description: p.description || '',
    default:
      p.default === undefined || p.default === null ? '' : String(p.default),
  }))
}

type SqlEditorPageProps = {
  mode: 'create' | 'edit'
  sqlId?: string
  initial?: SqlItem | null
  loading?: boolean
  loadError?: boolean
}

export function SqlEditorPage({
  mode,
  sqlId,
  initial = null,
  loading = false,
  loadError = false,
}: SqlEditorPageProps) {
  const isEdit = mode === 'edit'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [sqlTab, setSqlTab] = useState<'write' | 'ai'>('write')
  const [prompt, setPrompt] = useState('')
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(
    new Set()
  )
  const [aiMeta, setAiMeta] = useState<AiMeta | null>(null)
  const [review, setReview] = useState<ReviewResult | null>(null)
  const [genProgress, setGenProgress] = useState<GenerateProgressEvent[]>([])
  const [reviewedFor, setReviewedFor] = useState<{
    sql: string
    connection_id: string
  } | null>(null)
  const [applyingIndex, setApplyingIndex] = useState<number | 'all' | null>(
    null
  )
  const [allowLeave, setAllowLeave] = useState(false)
  // Sync ref so shouldBlockFn sees the flag in the same tick as navigate after Save.
  const allowLeaveRef = useRef(false)

  const connectionsQuery = useQuery({
    queryKey: ['connections', { page: 1, size: 100 }],
    queryFn: () => listConnections({ page: 1, size: 100 }),
  })

  const form = useForm<SqlEditorForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      connection_id: '',
      name: '',
      description: '',
      sql: '',
      params: [],
      status: 'enabled',
      mock_enabled: false,
      mock_data: DEFAULT_MOCK_DATA,
    },
  })

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'params',
  })

  const connectionId = form.watch('connection_id')
  const sqlValue = form.watch('sql')
  const statusValue = form.watch('status')
  const nameValue = form.watch('name')
  const mockEnabled = form.watch('mock_enabled')
  const mockDataValue = form.watch('mock_data')
  const isDirty = form.formState.isDirty

  const needsReview = useMemo(() => {
    if (statusValue === 'draft') return false
    return !(
      reviewedFor !== null &&
      reviewedFor.sql === sqlValue &&
      reviewedFor.connection_id === connectionId
    )
  }, [statusValue, reviewedFor, sqlValue, connectionId])

  const canSave = !needsReview

  const selectedConnection = useMemo(
    () =>
      (connectionsQuery.data?.list ?? []).find((c) => c.id === connectionId),
    [connectionsQuery.data?.list, connectionId]
  )

  const dialect: SqlDialect = datasourceProtocol(selectedConnection?.type)

  /** Format then write SQL; on failure keep raw and toast. */
  const applyFormattedSql = (
    raw: string,
    opts?: { successToast?: boolean }
  ) => {
    try {
      const formatted = formatSql(raw, dialect)
      form.setValue('sql', formatted, {
        shouldValidate: true,
        shouldDirty: true,
      })
      if (opts?.successToast) {
        toast.success('SQL formatted')
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to format SQL.'
      toast.error(message)
      form.setValue('sql', raw, { shouldValidate: true, shouldDirty: true })
    }
  }

  const modelsQuery = useQuery({
    queryKey: ['models', { connection_id: connectionId, size: 100 }],
    queryFn: () =>
      listModels({ connection_id: connectionId, page: 1, size: 100 }),
    enabled: !!connectionId && (sqlTab === 'ai' || mockEnabled),
  })

  useEffect(() => {
    if (loading) return
    if (isEdit && initial) {
      // Wait for connections so Radix Select has matching options when
      // form.reset updates connection_id (avoids bubble sync clearing to "").
      if (connectionsQuery.isLoading) return
      form.reset({
        connection_id: initial.connection_id,
        name: initial.name,
        description: initial.description || '',
        sql: initial.sql,
        params: mapParamsToForm(initial.params),
        status: initial.status,
        mock_enabled: !!initial.mock_enabled,
        mock_data: formatMockDataJson(initial.mock_data),
      })
      setReview(initial.review)
      if (initial.review?.passed && initial.status !== 'draft') {
        setReviewedFor({
          sql: initial.sql,
          connection_id: initial.connection_id,
        })
      } else {
        setReviewedFor(null)
      }
      setAiMeta(null)
      setPrompt('')
      setGenProgress([])
      setSqlTab('write')
    } else if (!isEdit) {
      form.reset({
        connection_id: '',
        name: '',
        description: '',
        sql: '',
        params: [],
        status: 'enabled',
        mock_enabled: false,
        mock_data: DEFAULT_MOCK_DATA,
      })
      setReview(null)
      setReviewedFor(null)
      setAiMeta(null)
    }
  }, [loading, isEdit, initial, form, connectionsQuery.isLoading])

  useEffect(() => {
    setSelectedModelIds(new Set())
  }, [connectionId])

  const blocker = useBlocker({
    shouldBlockFn: () => isDirty && !allowLeaveRef.current,
    withResolver: true,
    enableBeforeUnload: isDirty && !allowLeave,
  })

  const saveMutation = useMutation({
    mutationFn: async (values: SqlEditorForm) => {
      const params = values.params.map((p) => ({
        name: p.name,
        rule: p.rule,
        description: p.description || undefined,
        default: p.default?.trim() ? p.default : undefined,
      }))
      // When mock is off and the staged text is not a valid JSON object,
      // omit mock_data so the backend keeps the previously stored payload.
      let mock_data: Record<string, unknown> | undefined
      try {
        const parsed = JSON.parse(values.mock_data || '{}') as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          mock_data = parsed as Record<string, unknown>
        } else if (values.mock_enabled) {
          throw new Error('Mock data must be a JSON object.')
        }
      } catch (err) {
        if (values.mock_enabled) {
          throw err instanceof Error
            ? err
            : new Error('Mock data must be valid JSON.')
        }
      }
      if (isEdit && sqlId) {
        return updateSql(sqlId, {
          connection_id: values.connection_id,
          name: values.name,
          description: values.description || '',
          sql: values.sql,
          params,
          status: values.status,
          mock_enabled: values.mock_enabled,
          mock_data,
        })
      }
      return createSql({
        connection_id: values.connection_id,
        name: values.name,
        description: values.description || '',
        sql: values.sql,
        params,
        status: values.status === 'draft' ? 'draft' : 'enabled',
        mock_enabled: values.mock_enabled,
        mock_data,
      })
    },
    onSuccess: (_data, values) => {
      queryClient.invalidateQueries({ queryKey: ['sqls'] })
      toast.success(
        values.status === 'draft'
          ? isEdit
            ? 'Draft saved.'
            : 'Draft created.'
          : isEdit
            ? 'SQL API updated.'
            : 'SQL API created.'
      )
      allowLeaveRef.current = true
      setAllowLeave(true)
      form.reset(values)
      void navigate({ to: '/sqls' })
    },
    onError: (err) => {
      if (err instanceof AxiosError && err.response?.status === 409) {
        toast.error('A SQL API with this name already exists.')
        return
      }
      const reviewResult = extractReviewResult(err)
      if (reviewResult) {
        setReview(reviewResult)
        toast.error('SQL review failed. Fix the issues and try again.')
        return
      }
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Request failed.'
      toast.error(message)
    },
  })

  const generateMutation = useMutation({
    mutationFn: () => {
      if (!connectionId) throw new Error('Connection is required.')
      if (!prompt.trim()) throw new Error('Prompt is required.')
      setGenProgress([])
      return generateSqlStream(
        {
          connection_id: connectionId,
          prompt: prompt.trim(),
          model_ids:
            selectedModelIds.size > 0
              ? Array.from(selectedModelIds)
              : undefined,
        },
        (event) => {
          setGenProgress((prev) => [...prev, event])
          if (
            event.stage === 'plan' &&
            event.status === 'done' &&
            event.tables &&
            event.tables.length > 0
          ) {
            const models = modelsQuery.data?.list ?? []
            const next = new Set<string>()
            for (const table of event.tables) {
              const match = models.find((m) => m.table_name === table)
              if (match) next.add(match.id)
            }
            if (next.size > 0) setSelectedModelIds(next)
          }
        }
      )
    },
    onSuccess: (result) => {
      const currentName = form.getValues('name')?.trim() || ''
      if (!currentName && result.suggested_name) {
        form.setValue('name', result.suggested_name, { shouldValidate: true, shouldDirty: true })
      }
      applyFormattedSql(result.sql)
      replace(mapParamsToForm(result.params))
      if (result.selected_tables && result.selected_tables.length > 0) {
        const models = modelsQuery.data?.list ?? []
        const next = new Set<string>()
        for (const table of result.selected_tables) {
          const match = models.find((m) => m.table_name === table)
          if (match) next.add(match.id)
        }
        if (next.size > 0) setSelectedModelIds(next)
      }
      setAiMeta({
        explanation: result.explanation,
        sql_type: result.sql_type,
        method: result.method,
        selected_tables: result.selected_tables,
        steps: result.steps,
      })
      setReview(null)
      setReviewedFor(null)
      setSqlTab('write')
      toast.success('SQL generated. Review and save when ready.')
    },
    onError: (err) => {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.error('AI generation was cancelled or timed out.')
        return
      }
      if (err instanceof Error && !(err instanceof GenerateSqlStreamError)) {
        toast.error(err.message)
        return
      }
      if (err instanceof GenerateSqlStreamError && err.status === 503) {
        toast.error(
          err.message ||
            'AI service unavailable. Check AI provider configuration.'
        )
        return
      }
      if (err instanceof GenerateSqlStreamError) {
        toast.error(err.message || 'Failed to generate SQL.')
        return
      }
      toast.error('Failed to generate SQL.')
    },
  })

  const nameGenMutation = useMutation({
    mutationFn: () => {
      const sql = sqlValue.trim()
      const promptText = prompt.trim()
      if (!sql && !promptText) {
        throw new Error('Provide SQL or a prompt first.')
      }
      const paramNames = (form.getValues('params') || [])
        .map((p) => p.name?.trim())
        .filter((n): n is string => Boolean(n))
      return generateSqlName({
        prompt: promptText || undefined,
        sql: sql || undefined,
        params: paramNames.length > 0 ? paramNames : undefined,
      })
    },
    onSuccess: (result) => {
      if (result.name) {
        form.setValue('name', result.name, {
          shouldValidate: true,
          shouldDirty: true,
        })
        toast.success('Name suggested.')
      }
    },
    onError: (err) => {
      if (err instanceof Error && !(err instanceof AxiosError)) {
        toast.error(err.message)
        return
      }
      if (err instanceof AxiosError && err.response?.status === 503) {
        toast.error(
          (err.response?.data as { message?: string })?.message ||
            'AI service unavailable. Check AI provider configuration.'
        )
        return
      }
      if (err instanceof AxiosError && err.response?.status === 422) {
        toast.error(
          (err.response?.data as { message?: string })?.message ||
            'AI did not produce a usable name.'
        )
        return
      }
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to generate name.'
      toast.error(message)
    },
  })

  const mockGenMutation = useMutation({
    mutationFn: () => {
      if (!connectionId) throw new Error('Connection is required.')
      if (!sqlValue.trim()) throw new Error('SQL is required.')
      return generateSqlMock({
        connection_id: connectionId,
        sql: sqlValue.trim(),
        model_ids:
          selectedModelIds.size > 0
            ? Array.from(selectedModelIds)
            : undefined,
      })
    },
    onSuccess: (result) => {
      form.setValue('mock_data', formatMockDataJson(result.mock_data), {
        shouldValidate: true,
        shouldDirty: true,
      })
      form.setValue('mock_enabled', true, {
        shouldValidate: true,
        shouldDirty: true,
      })
      toast.success('Mock data generated.')
    },
    onError: (err) => {
      if (err instanceof Error && !(err instanceof AxiosError)) {
        toast.error(err.message)
        return
      }
      if (err instanceof AxiosError && err.response?.status === 503) {
        toast.error(
          (err.response?.data as { message?: string })?.message ||
            'AI service unavailable. Check AI provider configuration.'
        )
        return
      }
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to generate mock data.'
      toast.error(message)
    },
  })

  const formatMockData = () => {
    try {
      const parsed = JSON.parse(mockDataValue || '{}') as unknown
      form.setValue('mock_data', formatMockDataJson(parsed), {
        shouldValidate: true,
        shouldDirty: true,
      })
      toast.success('JSON formatted')
    } catch {
      toast.error('Invalid JSON. Fix syntax before formatting.')
    }
  }

  const reviewMutation = useMutation({
    mutationFn: () => {
      if (!sqlValue.trim()) throw new Error('SQL is required.')
      return reviewSql({
        sql: sqlValue,
        connection_id: connectionId || undefined,
      })
    },
    onSuccess: (result) => {
      setReview(result)
      if (result.passed) {
        setReviewedFor({ sql: sqlValue, connection_id: connectionId })
      } else {
        setReviewedFor(null)
      }
      toast.success(result.passed ? 'Review passed.' : 'Review found issues.')
    },
    onError: (err) => {
      if (err instanceof Error && !(err instanceof AxiosError)) {
        toast.error(err.message)
        return
      }
      if (err instanceof AxiosError && err.response?.status === 503) {
        toast.error(
          (err.response?.data as { message?: string })?.message ||
            'AI service unavailable.'
        )
        return
      }
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to review SQL.'
      toast.error(message)
    },
  })

  const applyMutation = useMutation({
    mutationFn: async (issues: ReviewIssue[]) => {
      if (!connectionId) throw new Error('Connection is required.')
      if (!sqlValue.trim()) throw new Error('SQL is required.')
      if (issues.length === 0) throw new Error('No applicable issues.')
      return applySqlReview({
        connection_id: connectionId,
        sql: sqlValue,
        issues,
      })
    },
    onSuccess: (result) => {
      applyFormattedSql(result.sql)
      replace(mapParamsToForm(result.params))
      setAiMeta({
        explanation: result.explanation,
        sql_type: result.sql_type,
        method: result.method,
      })
      setReview(null)
      setReviewedFor(null)
      setApplyingIndex(null)
      setSqlTab('write')
      toast.success('Suggestions applied. Run Review again before saving.')
    },
    onError: (err) => {
      setApplyingIndex(null)
      if (err instanceof Error && !(err instanceof AxiosError)) {
        toast.error(err.message)
        return
      }
      if (err instanceof AxiosError && err.response?.status === 503) {
        toast.error(
          (err.response?.data as { message?: string })?.message ||
            'AI service unavailable. Check AI provider configuration.'
        )
        return
      }
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to apply review suggestions.'
      toast.error(message)
    },
  })

  const onSubmit = (values: SqlEditorForm) => {
    if (values.status !== 'draft' && needsReview) {
      toast.error('Run Review before saving.')
      return
    }
    saveMutation.mutate(values)
  }

  const onSaveDraft = () => {
    const values = form.getValues()
    form.clearErrors()
    void form.trigger().then((ok) => {
      if (!ok) return
      saveMutation.mutate({ ...values, status: 'draft' })
    })
  }

  const toggleModel = (id: string, checked: boolean) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const onApplyOne = (issue: ReviewIssue, index: number) => {
    setApplyingIndex(index)
    applyMutation.mutate([issue])
  }

  const onApplyAll = () => {
    const issues = (review?.issues || []).filter(
      (i) => i.severity === 'error' || i.severity === 'warning'
    )
    setApplyingIndex('all')
    applyMutation.mutate(issues)
  }

  if (loadError) {
    return (
      <>
        <Header fixed>
          <Search />
          <div className='ms-auto flex items-center gap-4'>
            <ThemeSwitch />
            <ConfigDrawer />
            <ProfileDropdown />
          </div>
        </Header>
        <Main className='flex flex-1 flex-col gap-4'>
          <p className='text-sm text-muted-foreground'>
            SQL API not found. It may have been deleted.
          </p>
          <Button asChild variant='outline' className='w-fit cursor-pointer'>
            <Link to='/sqls'>Back to SQL APIs</Link>
          </Button>
        </Main>
      </>
    )
  }

  const title = isEdit
    ? `Edit: ${nameValue || initial?.name || 'SQL API'}`
    : 'New SQL API'

  return (
    <>
      <Header fixed>
        <Search />
        <div className='ms-auto flex items-center gap-4'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-0 sm:rounded-lg sm:border sm:px-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex min-w-0 items-center gap-3'>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='cursor-pointer'
                asChild
              >
                <Link to='/sqls' aria-label='Back to SQL APIs'>
                  <ArrowLeft />
                </Link>
              </Button>
              <div className='min-w-0'>
                <h2 className='truncate text-xl font-bold tracking-tight'>
                  {title}
                </h2>
                <p className='text-sm text-muted-foreground'>
                  {isEdit
                    ? 'Update the SQL statement, parameters, and status.'
                    : 'Register a SQL statement as an invokable API.'}
                </p>
              </div>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              {needsReview && statusValue !== 'draft' ? (
                <span className='text-xs text-muted-foreground'>
                  Run Review before saving
                </span>
              ) : null}
              <Button
                type='button'
                variant='outline'
                className='cursor-pointer'
                disabled={
                  reviewMutation.isPending || !sqlValue.trim() || loading
                }
                onClick={() => reviewMutation.mutate()}
              >
                {reviewMutation.isPending ? (
                  <Loader2 className='animate-spin' />
                ) : (
                  <ShieldCheck />
                )}
                {reviewMutation.isPending ? 'Reviewing...' : 'Review'}
              </Button>
              {!isEdit ? (
                <Button
                  type='button'
                  variant='secondary'
                  className='cursor-pointer'
                  disabled={
                    saveMutation.isPending || !sqlValue.trim() || loading
                  }
                  onClick={onSaveDraft}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className='animate-spin' />
                  ) : (
                    <Save />
                  )}
                  Save Draft
                </Button>
              ) : null}
              <Button
                type='submit'
                form='sql-editor-form'
                className='cursor-pointer'
                disabled={saveMutation.isPending || !canSave || loading}
              >
                {saveMutation.isPending ? (
                  <Loader2 className='animate-spin' />
                ) : (
                  <Save />
                )}
                {saveMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className='grid gap-4 lg:grid-cols-[1fr_380px]'>
            <div className='flex flex-col gap-4'>
              <Skeleton className='h-80 w-full' />
              <Skeleton className='h-40 w-full' />
            </div>
            <div className='flex flex-col gap-4'>
              <Skeleton className='h-64 w-full' />
              <Skeleton className='h-48 w-full' />
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form
              id='sql-editor-form'
              onSubmit={form.handleSubmit(onSubmit)}
              className='grid gap-4 lg:grid-cols-[1fr_380px]'
            >
              <div className='flex flex-col gap-4'>
                <Card>
                  <CardHeader className='border-b'>
                    <CardTitle>SQL</CardTitle>
                    <CardDescription>
                      Write SQL manually or generate with AI.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='pt-6'>
                    <Tabs
                      value={sqlTab}
                      onValueChange={(v) => setSqlTab(v as 'write' | 'ai')}
                    >
                      <div className='flex items-center justify-between gap-2'>
                        <TabsList>
                          <TabsTrigger value='write'>Write SQL</TabsTrigger>
                          <TabsTrigger value='ai'>Generate with AI</TabsTrigger>
                        </TabsList>
                        {sqlTab === 'write' ? (
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            className='h-8 cursor-pointer'
                            disabled={!sqlValue.trim()}
                            onClick={() =>
                              applyFormattedSql(sqlValue, {
                                successToast: true,
                              })
                            }
                          >
                            <AlignLeft />
                            Format
                          </Button>
                        ) : null}
                      </div>
                      <TabsContent value='write' className='flex flex-col gap-3'>
                        <FormField
                          control={form.control}
                          name='sql'
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <SqlEditor
                                  value={field.value}
                                  onChange={field.onChange}
                                  dialect={dialect}
                                  minHeight='320px'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        {aiMeta ? (
                          <div className='flex flex-col gap-2 rounded-md border bg-muted/40 p-3 text-sm'>
                            <div className='flex flex-wrap gap-2'>
                              {aiMeta.sql_type ? (
                                <Badge
                                  variant='outline'
                                  className='capitalize'
                                >
                                  {aiMeta.sql_type}
                                </Badge>
                              ) : null}
                              {aiMeta.method ? (
                                <Badge variant='secondary'>
                                  {aiMeta.method}
                                </Badge>
                              ) : null}
                            </div>
                            {aiMeta.selected_tables &&
                            aiMeta.selected_tables.length > 0 ? (
                              <p className='text-xs text-muted-foreground'>
                                Tables: {aiMeta.selected_tables.join(', ')}
                              </p>
                            ) : null}
                            {aiMeta.steps && aiMeta.steps.length > 0 ? (
                              <ul className='flex flex-col gap-0.5 text-xs text-muted-foreground'>
                                {aiMeta.steps.map((step, idx) => (
                                  <li key={`${step.stage}-${idx}`}>
                                    <span className='font-medium capitalize'>
                                      {step.stage}
                                    </span>
                                    : {step.message}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {aiMeta.explanation ? (
                              <p className='text-muted-foreground'>
                                {aiMeta.explanation}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </TabsContent>
                      <TabsContent value='ai'>
                        <AiGeneratePanel
                          connectionId={connectionId}
                          prompt={prompt}
                          onPromptChange={setPrompt}
                          models={modelsQuery.data?.list ?? []}
                          modelsLoading={modelsQuery.isLoading}
                          selectedModelIds={selectedModelIds}
                          onToggleModel={toggleModel}
                          generating={generateMutation.isPending}
                          progress={genProgress}
                          onGenerate={() => generateMutation.mutate()}
                        />
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>

                <ParamsCard
                  control={form.control}
                  fields={fields}
                  onAdd={() =>
                    append({
                      name: '',
                      rule: 'required|string',
                      description: '',
                      default: '',
                    })
                  }
                  onRemove={remove}
                />

                <MockDataCard
                  control={form.control}
                  mockEnabled={mockEnabled}
                  mockData={mockDataValue}
                  canGenerate={!!connectionId && !!sqlValue.trim()}
                  generating={mockGenMutation.isPending}
                  onFormat={formatMockData}
                  onGenerate={() => mockGenMutation.mutate()}
                />
              </div>

              <div className='flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start'>
                <Card>
                  <CardHeader className='border-b'>
                    <CardTitle>Basics</CardTitle>
                    <CardDescription>
                      Connection, name, and metadata.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='flex flex-col gap-4 pt-6'>
                    <FormField
                      control={form.control}
                      name='connection_id'
                      render={({ field }) => {
                        const selected = (
                          connectionsQuery.data?.list ?? []
                        ).find((c) => c.id === field.value)
                        const selectedLabel = selected
                          ? `${selected.name} (${selected.type})`
                          : undefined
                        return (
                          <FormItem>
                            <FormLabel>Connection</FormLabel>
                            <Select
                              value={field.value || undefined}
                              onValueChange={(value) => {
                                // Ignore empty clears from Radix native bubble
                                // when SelectItems are not mounted yet.
                                if (!value) return
                                field.onChange(value)
                              }}
                              disabled={connectionsQuery.isLoading}
                            >
                              <FormControl>
                                <SelectTrigger className='w-full'>
                                  <SelectValue placeholder='Select connection'>
                                    {selectedLabel}
                                  </SelectValue>
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {(connectionsQuery.data?.list ?? []).map(
                                  (c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.name} ({c.type})
                                    </SelectItem>
                                  )
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )
                      }}
                    />

                    <FormField
                      control={form.control}
                      name='name'
                      render={({ field }) => (
                        <FormItem>
                          <div className='flex items-center justify-between gap-2'>
                            <FormLabel>Name</FormLabel>
                            <Button
                              type='button'
                              variant='ghost'
                              size='sm'
                              className='h-7 cursor-pointer px-2 text-xs'
                              disabled={
                                nameGenMutation.isPending ||
                                (!sqlValue.trim() && !prompt.trim())
                              }
                              onClick={() => nameGenMutation.mutate()}
                            >
                              {nameGenMutation.isPending ? (
                                <Loader2 className='animate-spin' />
                              ) : (
                                <Sparkles />
                              )}
                              {nameGenMutation.isPending ? 'Naming...' : 'AI'}
                            </Button>
                          </div>
                          <FormControl>
                            <Input
                              placeholder='get-user-by-id'
                              autoComplete='off'
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {isEdit ? (
                      <FormField
                        control={form.control}
                        name='status'
                        render={({ field }) => {
                          const statusItems = [
                            { label: 'Enabled', value: 'enabled' },
                            { label: 'Disabled', value: 'disabled' },
                            { label: 'Draft', value: 'draft' },
                          ] as const
                          const statusLabel = statusItems.find(
                            (s) => s.value === field.value
                          )?.label
                          return (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select
                                value={field.value || undefined}
                                onValueChange={(value) => {
                                  if (!value) return
                                  field.onChange(value)
                                }}
                              >
                                <FormControl>
                                  <SelectTrigger className='w-full'>
                                    <SelectValue placeholder='Select status'>
                                      {statusLabel}
                                    </SelectValue>
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {statusItems.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>
                                      {s.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )
                        }}
                      />
                    ) : null}

                    <FormField
                      control={form.control}
                      name='description'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder='Optional description'
                              className='min-h-16'
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <ReviewCard
                  review={review}
                  applying={applyMutation.isPending}
                  applyingIndex={applyingIndex}
                  onApplyOne={onApplyOne}
                  onApplyAll={onApplyAll}
                />
              </div>
            </form>
          </Form>
        )}
      </Main>

      <AlertDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.status === 'blocked') {
            blocker.reset?.()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Leave this page and lose them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className='cursor-pointer'
              onClick={() => blocker.reset?.()}
            >
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              className='cursor-pointer'
              onClick={() => blocker.proceed?.()}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
