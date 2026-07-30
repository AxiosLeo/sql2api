import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { listConnections } from '@/api/connections'
import { listModels } from '@/api/models'
import {
  createSql,
  generateSql,
  reviewSql,
  updateSql,
  type ReviewResult,
} from '@/api/sqls'
import { SqlEditor, type SqlDialect } from '@/components/sql-editor'
import { Badge } from '@/components/ui/badge'
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { SelectDropdown } from '@/components/select-dropdown'
import { cn } from '@/lib/utils'
import { type Sql } from '../data/schema'

const paramSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  rule: z.string().min(1, 'Rule is required.'),
  description: z.string().optional(),
  default: z.string().optional(),
})

const formSchema = z.object({
  connection_id: z.string().min(1, 'Connection is required.'),
  name: z
    .string()
    .min(1, 'Name is required.')
    .max(64, 'Name must be at most 64 characters.'),
  description: z.string().optional(),
  sql: z.string().min(1, 'SQL is required.'),
  params: z.array(paramSchema),
  status: z.enum(['enabled', 'disabled']),
})

type SqlForm = z.infer<typeof formSchema>

type SqlsActionDialogProps = {
  currentRow?: Sql
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ReviewIssuesPanel({ review }: { review: ReviewResult | null }) {
  if (!review) return null
  return (
    <div
      className={cn(
        'space-y-2 rounded-md border p-3',
        review.passed
          ? 'border-teal-300 bg-teal-50/50 dark:bg-teal-950/20'
          : 'border-destructive/40 bg-destructive/5'
      )}
    >
      <div className='flex items-center gap-2'>
        <Badge
          variant='outline'
          className={cn(
            review.passed
              ? 'bg-teal-100/50 text-teal-900 dark:text-teal-200 border-teal-300'
              : 'bg-red-100/50 text-red-900 dark:text-red-200 border-red-300'
          )}
        >
          {review.passed ? 'Review passed' : 'Review failed'}
        </Badge>
        <span className='text-xs text-muted-foreground'>
          {review.issues.length} issue(s)
        </span>
      </div>
      {review.issues.length > 0 && (
        <ul className='space-y-2'>
          {review.issues.map((issue, idx) => (
            <li key={idx} className='text-sm'>
              <div className='flex items-start gap-2'>
                <Badge variant='outline' className='mt-0.5 capitalize'>
                  {issue.severity}
                </Badge>
                <div>
                  <p>{issue.message}</p>
                  {issue.suggestion ? (
                    <p className='text-muted-foreground'>
                      Suggestion: {issue.suggestion}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function extractReviewResult(err: unknown): ReviewResult | null {
  if (!(err instanceof AxiosError)) return null
  const status = err.response?.status
  if (status !== 422) return null
  const data = err.response?.data as
    | { data?: ReviewResult; passed?: boolean; issues?: ReviewResult['issues'] }
    | undefined
  if (!data) return null
  if (typeof data.passed === 'boolean' && Array.isArray(data.issues)) {
    return { passed: data.passed, issues: data.issues }
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

export function SqlsActionDialog({
  currentRow,
  open,
  onOpenChange,
}: SqlsActionDialogProps) {
  const isEdit = !!currentRow
  const queryClient = useQueryClient()
  const [sqlTab, setSqlTab] = useState<'write' | 'ai'>('write')
  const [prompt, setPrompt] = useState('')
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(
    new Set()
  )
  const [aiMeta, setAiMeta] = useState<{
    explanation?: string
    sql_type?: string
    method?: string
  } | null>(null)
  const [review, setReview] = useState<ReviewResult | null>(null)

  const connectionsQuery = useQuery({
    queryKey: ['connections', { page: 1, size: 100 }],
    queryFn: () => listConnections({ page: 1, size: 100 }),
    enabled: open,
  })

  const form = useForm<SqlForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      connection_id: '',
      name: '',
      description: '',
      sql: '',
      params: [],
      status: 'enabled',
    },
  })

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'params',
  })

  const connectionId = form.watch('connection_id')
  const sqlValue = form.watch('sql')

  const selectedConnection = useMemo(
    () =>
      (connectionsQuery.data?.list ?? []).find((c) => c.id === connectionId),
    [connectionsQuery.data?.list, connectionId]
  )

  const dialect: SqlDialect =
    selectedConnection?.type === 'postgresql' ? 'postgresql' : 'mysql'

  const modelsQuery = useQuery({
    queryKey: ['models', { connection_id: connectionId, size: 100 }],
    queryFn: () =>
      listModels({ connection_id: connectionId, page: 1, size: 100 }),
    enabled: open && !!connectionId && sqlTab === 'ai',
  })

  useEffect(() => {
    if (!open) return
    setSqlTab('write')
    setPrompt('')
    setSelectedModelIds(new Set())
    setAiMeta(null)
    setReview(null)
    if (currentRow) {
      form.reset({
        connection_id: currentRow.connection_id,
        name: currentRow.name,
        description: currentRow.description || '',
        sql: currentRow.sql,
        params: currentRow.params.map((p) => ({
          name: p.name,
          rule: p.rule,
          description: p.description || '',
          default:
            p.default === undefined || p.default === null
              ? ''
              : String(p.default),
        })),
        status: currentRow.status,
      })
      setReview(currentRow.review)
    } else {
      form.reset({
        connection_id: '',
        name: '',
        description: '',
        sql: '',
        params: [],
        status: 'enabled',
      })
    }
  }, [open, currentRow, form])

  useEffect(() => {
    setSelectedModelIds(new Set())
  }, [connectionId])

  const saveMutation = useMutation({
    mutationFn: async (values: SqlForm) => {
      const params = values.params.map((p) => ({
        name: p.name,
        rule: p.rule,
        description: p.description || undefined,
        default: p.default?.trim() ? p.default : undefined,
      }))
      if (isEdit && currentRow) {
        return updateSql(currentRow.id, {
          connection_id: values.connection_id,
          name: values.name,
          description: values.description || '',
          sql: values.sql,
          params,
          status: values.status,
        })
      }
      return createSql({
        connection_id: values.connection_id,
        name: values.name,
        description: values.description || '',
        sql: values.sql,
        params,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sqls'] })
      toast.success(isEdit ? 'SQL API updated.' : 'SQL API created.')
      onOpenChange(false)
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
      return generateSql({
        connection_id: connectionId,
        prompt: prompt.trim(),
        model_ids:
          selectedModelIds.size > 0
            ? Array.from(selectedModelIds)
            : undefined,
      })
    },
    onSuccess: (result) => {
      form.setValue('sql', result.sql, { shouldValidate: true })
      replace(
        (result.params || []).map((p) => ({
          name: p.name,
          rule: p.rule,
          description: p.description || '',
          default:
            p.default === undefined || p.default === null
              ? ''
              : String(p.default),
        }))
      )
      setAiMeta({
        explanation: result.explanation,
        sql_type: result.sql_type,
        method: result.method,
      })
      setReview(null)
      setSqlTab('write')
      toast.success('SQL generated. Review and save when ready.')
    },
    onError: (err) => {
      if (err instanceof Error && !(err instanceof AxiosError)) {
        toast.error(err.message)
        return
      }
      if (err instanceof AxiosError && err.response?.status === 503) {
        toast.error(
          (err.response?.data as { message?: string })?.message ||
            'AI service unavailable. Check LLAMA_MODEL_PATH.'
        )
        return
      }
      if (err instanceof AxiosError && err.code === 'ECONNABORTED') {
        toast.error('AI generation timed out. Please try again.')
        return
      }
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Failed to generate SQL.'
      toast.error(message)
    },
  })

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

  const onSubmit = (values: SqlForm) => {
    saveMutation.mutate(values)
  }

  const toggleModel = (id: string, checked: boolean) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        if (!state) form.reset()
        onOpenChange(state)
      }}
    >
      <DialogContent className='flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl'>
        <DialogHeader className='shrink-0 space-y-1.5 border-b px-6 pt-6 pb-4 text-start'>
          <DialogTitle>
            {isEdit ? 'Edit SQL API' : 'Add SQL API'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the SQL statement, parameters, and status.'
              : 'Register a SQL statement as an invokable API. Write SQL manually or generate with AI.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id='sql-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='flex min-h-0 flex-1 flex-col'
          >
            <div className='min-h-0 flex-1 overflow-y-auto px-6 py-4'>
              <div className='space-y-4'>
                <FormField
                  control={form.control}
                  name='connection_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Connection</FormLabel>
                      <Select
                        value={field.value || undefined}
                        onValueChange={field.onChange}
                        disabled={connectionsQuery.isLoading}
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue placeholder='Select connection' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(connectionsQuery.data?.list ?? []).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} ({c.type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                  <FormField
                    control={form.control}
                    name='name'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
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
                              { label: 'Enabled', value: 'enabled' },
                              { label: 'Disabled', value: 'disabled' },
                            ]}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

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

                <div className='space-y-2'>
                  <Label>SQL</Label>
                  <Tabs
                    value={sqlTab}
                    onValueChange={(v) => setSqlTab(v as 'write' | 'ai')}
                  >
                    <TabsList>
                      <TabsTrigger value='write'>Write SQL</TabsTrigger>
                      <TabsTrigger value='ai'>Generate with AI</TabsTrigger>
                    </TabsList>
                    <TabsContent value='write' className='space-y-2'>
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
                                minHeight='180px'
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {aiMeta && (
                        <div className='space-y-2 rounded-md border bg-muted/40 p-3 text-sm'>
                          <div className='flex flex-wrap gap-2'>
                            {aiMeta.sql_type && (
                              <Badge variant='outline' className='capitalize'>
                                {aiMeta.sql_type}
                              </Badge>
                            )}
                            {aiMeta.method && (
                              <Badge variant='secondary'>
                                {aiMeta.method}
                              </Badge>
                            )}
                          </div>
                          {aiMeta.explanation ? (
                            <p className='text-muted-foreground'>
                              {aiMeta.explanation}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </TabsContent>
                    <TabsContent value='ai' className='space-y-3'>
                      {!connectionId ? (
                        <p className='text-sm text-muted-foreground'>
                          Select a connection first.
                        </p>
                      ) : (
                        <>
                          <div className='space-y-2'>
                            <Label>Prompt</Label>
                            <Textarea
                              value={prompt}
                              onChange={(e) => setPrompt(e.target.value)}
                              placeholder='e.g. Query all orders for a given user id'
                              rows={3}
                              className='min-h-20'
                            />
                          </div>
                          <div className='space-y-2'>
                            <Label>Table models (optional context)</Label>
                            {modelsQuery.isLoading ? (
                              <p className='text-sm text-muted-foreground'>
                                Loading models...
                              </p>
                            ) : (modelsQuery.data?.list ?? []).length === 0 ? (
                              <p className='text-sm text-muted-foreground'>
                                No models for this connection. Generate models
                                first for better results.
                              </p>
                            ) : (
                              <div className='max-h-28 space-y-2 overflow-y-auto rounded-md border p-2'>
                                {(modelsQuery.data?.list ?? []).map((m) => (
                                  <label
                                    key={m.id}
                                    className='flex cursor-pointer items-center gap-2 text-sm'
                                  >
                                    <Checkbox
                                      checked={selectedModelIds.has(m.id)}
                                      onCheckedChange={(v) =>
                                        toggleModel(m.id, v === true)
                                      }
                                    />
                                    <span className='font-medium'>
                                      {m.table_name}
                                    </span>
                                    {m.comment ? (
                                      <span className='text-muted-foreground'>
                                        — {m.comment}
                                      </span>
                                    ) : null}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                          <Button
                            type='button'
                            variant='secondary'
                            disabled={
                              generateMutation.isPending || !prompt.trim()
                            }
                            onClick={() => generateMutation.mutate()}
                          >
                            <Sparkles className='me-1 h-4 w-4' />
                            {generateMutation.isPending
                              ? 'Generating...'
                              : 'Generate'}
                          </Button>
                        </>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>

                <div className='space-y-2'>
                  <div className='flex items-center justify-between'>
                    <Label>Parameters</Label>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        append({
                          name: '',
                          rule: 'required|string',
                          description: '',
                          default: '',
                        })
                      }
                    >
                      <Plus className='me-1 h-4 w-4' /> Add Param
                    </Button>
                  </div>
                  {fields.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>
                      No parameters. Use <code>:name</code> placeholders in SQL
                      and add matching params.
                    </p>
                  ) : (
                    <div className='space-y-3'>
                      {fields.map((field, index) => (
                        <div
                          key={field.id}
                          className='grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]'
                        >
                          <FormField
                            control={form.control}
                            name={`params.${index}.name`}
                            render={({ field: f }) => (
                              <FormItem>
                                <FormLabel className='text-xs'>Name</FormLabel>
                                <FormControl>
                                  <Input placeholder='id' {...f} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`params.${index}.rule`}
                            render={({ field: f }) => (
                              <FormItem>
                                <FormLabel className='text-xs'>Rule</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder='required|integer'
                                    {...f}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`params.${index}.description`}
                            render={({ field: f }) => (
                              <FormItem>
                                <FormLabel className='text-xs'>
                                  Description
                                </FormLabel>
                                <FormControl>
                                  <Input placeholder='Optional' {...f} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`params.${index}.default`}
                            render={({ field: f }) => (
                              <FormItem>
                                <FormLabel className='text-xs'>
                                  Default
                                </FormLabel>
                                <FormControl>
                                  <Input placeholder='Optional' {...f} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className='flex items-end'>
                            <Button
                              type='button'
                              variant='ghost'
                              size='icon'
                              onClick={() => remove(index)}
                            >
                              <Trash2 className='h-4 w-4 text-destructive' />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <ReviewIssuesPanel review={review} />
              </div>
            </div>
          </form>
        </Form>

        <DialogFooter className='shrink-0 gap-2 border-t px-6 py-4 sm:justify-between'>
          <Button
            type='button'
            variant='outline'
            disabled={reviewMutation.isPending || !sqlValue.trim()}
            onClick={() => reviewMutation.mutate()}
          >
            {reviewMutation.isPending ? 'Reviewing...' : 'Review'}
          </Button>
          <Button
            type='submit'
            form='sql-form'
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
