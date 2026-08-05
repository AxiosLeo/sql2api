import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  META_FIELD_TYPE_LABELS,
  META_LINK_FILTER_OPS,
  META_USER_FIELD_TYPES,
  createMetaField,
  listMetaFields,
  listMetaTables,
  updateMetaField,
  type MetaFieldConfig,
  type MetaFieldItem,
  type MetaLinkFilter,
  type MetaLinkFilterOp,
  type MetaUserFieldType,
} from '@/api/meta'
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { SelectDropdown } from '@/components/select-dropdown'
import { RuleBuilderDialog } from '@/features/sqls/editor/rule-builder/rule-builder-dialog'
import { ruleToBadges } from '@/features/sqls/editor/rule-builder/parse-serialize'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'

const OP_LABELS: Record<MetaLinkFilterOp, string> = {
  eq: '=',
  neq: '!=',
  in: 'in',
  contains: 'contains',
}

const filterRowSchema = z.object({
  field_id: z.string(),
  op: z.enum(META_LINK_FILTER_OPS),
  valueText: z.string(),
})

const formSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name is required.')
      .max(128, 'Name must be at most 128 characters.'),
    type: z.enum(META_USER_FIELD_TYPES),
    validator: z.string().optional(),
    optionsText: z.string().optional(),
    format: z.string().optional(),
    target_table_id: z.string().optional(),
    multiple: z.boolean(),
    link_scope: z.enum(['all', 'filter']),
    filters: z.array(filterRowSchema),
  })
  .superRefine((values, ctx) => {
    if (
      values.type !== 'one_way_link' &&
      values.type !== 'two_way_link'
    ) {
      return
    }
    if (!values.target_table_id?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['target_table_id'],
        message: 'Target table is required.',
      })
    }
    if (values.link_scope === 'filter') {
      if (!values.filters.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['filters'],
          message: 'Add at least one filter condition.',
        })
      }
      values.filters.forEach((row, index) => {
        if (!row.field_id.trim()) {
          ctx.addIssue({
            code: 'custom',
            path: ['filters', index, 'field_id'],
            message: 'Field is required.',
          })
        }
        if (!row.valueText.trim()) {
          ctx.addIssue({
            code: 'custom',
            path: ['filters', index, 'valueText'],
            message: 'Value is required.',
          })
        }
      })
    }
  })

type FieldForm = z.infer<typeof formSchema>

function filtersFromConfig(config: MetaFieldConfig): FieldForm['filters'] {
  if (config.link_scope !== 'filter' || !config.filters?.length) {
    return [{ field_id: '', op: 'eq', valueText: '' }]
  }
  return config.filters.map((f) => ({
    field_id: f.field_id,
    op: f.op,
    valueText: Array.isArray(f.value)
      ? f.value.map(String).join('\n')
      : String(f.value ?? ''),
  }))
}

function parseFilterRows(rows: FieldForm['filters']): MetaLinkFilter[] {
  return rows.map((row) => {
    if (row.op === 'in') {
      const value = row.valueText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)
      return { field_id: row.field_id, op: row.op, value }
    }
    return { field_id: row.field_id, op: row.op, value: row.valueText.trim() }
  })
}

type MetaFieldDialogProps = {
  tableId: string
  appId: string
  currentRow?: MetaFieldItem
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MetaFieldDialog({
  tableId,
  appId,
  currentRow,
  open,
  onOpenChange,
}: MetaFieldDialogProps) {
  const isEdit = !!currentRow
  const queryClient = useQueryClient()
  const [ruleOpen, setRuleOpen] = useState(false)

  const tablesQuery = useQuery({
    queryKey: ['meta-tables', { page: 1, size: 100, app_id: appId }],
    queryFn: () => listMetaTables({ page: 1, size: 100, app_id: appId }),
    enabled: open && !!appId,
  })

  const form = useForm<FieldForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      type: 'text',
      validator: '',
      optionsText: '',
      format: 'YYYY-MM-DD HH:mm:ss',
      target_table_id: '',
      multiple: true,
      link_scope: 'all',
      filters: [{ field_id: '', op: 'eq', valueText: '' }],
    },
  })

  const { fields: filterFields, append, remove } = useFieldArray({
    control: form.control,
    name: 'filters',
  })

  const fieldType = form.watch('type')
  const validator = form.watch('validator') || ''
  const targetTableId = form.watch('target_table_id')
  const linkScope = form.watch('link_scope')

  const targetFieldsQuery = useQuery({
    queryKey: ['meta-fields', targetTableId],
    queryFn: () => listMetaFields(targetTableId!),
    enabled:
      open &&
      !!targetTableId &&
      (fieldType === 'one_way_link' || fieldType === 'two_way_link'),
  })

  const targetFieldItems = useMemo(
    () =>
      (targetFieldsQuery.data?.list ?? []).map((f) => ({
        label: f.is_system ? `${f.name} (system)` : f.name,
        value: f.id,
      })),
    [targetFieldsQuery.data?.list]
  )

  useEffect(() => {
    if (!open) return
    if (currentRow) {
      const config = currentRow.config || {}
      form.reset({
        name: currentRow.name,
        type: (META_USER_FIELD_TYPES as readonly string[]).includes(
          currentRow.type
        )
          ? (currentRow.type as MetaUserFieldType)
          : 'text',
        validator: currentRow.validator || '',
        optionsText: (config.options || []).join('\n'),
        format: config.format || 'YYYY-MM-DD HH:mm:ss',
        target_table_id: config.target_table_id || '',
        multiple: config.multiple !== false,
        link_scope: config.link_scope === 'filter' ? 'filter' : 'all',
        filters: filtersFromConfig(config),
      })
    } else {
      form.reset({
        name: '',
        type: 'text',
        validator: '',
        optionsText: '',
        format: 'YYYY-MM-DD HH:mm:ss',
        target_table_id: '',
        multiple: true,
        link_scope: 'all',
        filters: [{ field_id: '', op: 'eq', valueText: '' }],
      })
    }
  }, [open, currentRow, form])

  const typeItems = useMemo(
    () =>
      META_USER_FIELD_TYPES.map((t) => ({
        label: META_FIELD_TYPE_LABELS[t],
        value: t,
      })),
    []
  )

  const mutation = useMutation({
    mutationFn: async (values: FieldForm) => {
      const config: MetaFieldConfig = {}
      if (
        values.type === 'single_select' ||
        values.type === 'multi_select'
      ) {
        config.options = (values.optionsText || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      }
      if (values.type === 'datetime') {
        config.format = values.format || 'YYYY-MM-DD HH:mm:ss'
      }
      if (
        values.type === 'one_way_link' ||
        values.type === 'two_way_link'
      ) {
        config.target_table_id = values.target_table_id
        config.multiple = values.multiple
        config.link_scope = values.link_scope
        if (values.link_scope === 'filter') {
          config.filters = parseFilterRows(values.filters)
        }
      }
      if (values.type === 'attachment') {
        config.multiple = values.multiple
      }

      if (isEdit && currentRow) {
        return updateMetaField(currentRow.id, {
          name: values.name,
          type: values.type,
          validator: values.validator || '',
          config,
        })
      }
      return createMetaField(tableId, {
        name: values.name,
        type: values.type,
        validator: values.validator || '',
        config,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-fields', tableId] })
      queryClient.invalidateQueries({ queryKey: ['meta-tables'] })
      if (targetTableId) {
        queryClient.invalidateQueries({
          queryKey: ['meta-fields', targetTableId],
        })
      }
      toast.success(isEdit ? 'Field updated.' : 'Field created.')
      onOpenChange(false)
    },
    onError: (err) => {
      if (err instanceof AxiosError && err.response?.status === 409) {
        toast.error('A field with this name already exists.')
        return
      }
      const message =
        err instanceof AxiosError
          ? (err.response?.data as { message?: string })?.message || err.message
          : 'Request failed.'
      toast.error(message)
    },
  })

  const badges = ruleToBadges(validator)
  const isLinkType =
    fieldType === 'one_way_link' || fieldType === 'two_way_link'

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(state) => {
          if (!state) form.reset()
          onOpenChange(state)
        }}
      >
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-xl'>
          <DialogHeader className='text-start'>
            <DialogTitle>{isEdit ? 'Edit Field' : 'Add Field'}</DialogTitle>
            <DialogDescription>
              Configure a dynamic field. Validation rules use validatorjs.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              id='meta-field-form'
              onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
              className='space-y-4'
            >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='title'
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
                name='type'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <SelectDropdown
                      isControlled
                      defaultValue={field.value}
                      onValueChange={field.onChange}
                      placeholder='Select type'
                      items={typeItems}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(fieldType === 'single_select' ||
                fieldType === 'multi_select') && (
                <FormField
                  control={form.control}
                  name='optionsText'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Options</FormLabel>
                      <FormControl>
                        <textarea
                          className='border-input bg-background min-h-24 w-full rounded-md border px-3 py-2 text-sm'
                          placeholder={'Option A\nOption B'}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        One option per line. Empty options create freely.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {fieldType === 'datetime' && (
                <FormField
                  control={form.control}
                  name='format'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Format</FormLabel>
                      <FormControl>
                        <Input placeholder='YYYY-MM-DD HH:mm:ss' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isLinkType && (
                <>
                  <FormField
                    control={form.control}
                    name='target_table_id'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Table</FormLabel>
                        <SelectDropdown
                          isControlled
                          defaultValue={field.value}
                          onValueChange={(value) => {
                            field.onChange(value)
                            form.setValue('filters', [
                              { field_id: '', op: 'eq', valueText: '' },
                            ])
                          }}
                          placeholder='Select target table'
                          items={(tablesQuery.data?.list ?? []).map((t) => ({
                            label:
                              t.id === tableId
                                ? `${t.name} (this table)`
                                : t.name,
                            value: t.id,
                          }))}
                        />
                        <FormDescription>
                          Choose a meta table under the same app.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {fieldType === 'two_way_link' && (
                    <p className='text-muted-foreground text-sm'>
                      Saving a two-way link also creates a reverse two-way link
                      field on the target table pointing back to this table.
                    </p>
                  )}

                  <FormField
                    control={form.control}
                    name='multiple'
                    render={({ field }) => (
                      <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                        <div className='space-y-0.5'>
                          <FormLabel>Allow multiple</FormLabel>
                          <FormDescription>
                            Link to multiple records (default on).
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='link_scope'
                    render={({ field }) => (
                      <FormItem className='space-y-3'>
                        <FormLabel>Association scope</FormLabel>
                        <FormControl>
                          <RadioGroup
                            value={field.value}
                            onValueChange={field.onChange}
                            className='gap-2'
                          >
                            <div className='flex items-center gap-2'>
                              <RadioGroupItem value='all' id='link-scope-all' />
                              <Label htmlFor='link-scope-all'>
                                All records
                              </Label>
                            </div>
                            <div className='flex items-center gap-2'>
                              <RadioGroupItem
                                value='filter'
                                id='link-scope-filter'
                              />
                              <Label htmlFor='link-scope-filter'>
                                Filtered records
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormDescription>
                          Limit which target records can be linked. Filters are
                          combined with AND.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {linkScope === 'filter' && (
                    <div className='space-y-3 rounded-lg border p-3'>
                      <div className='flex items-center justify-between'>
                        <FormLabel>Filter conditions</FormLabel>
                        <Button
                          type='button'
                          variant='outline'
                          size='sm'
                          disabled={!targetTableId}
                          onClick={() =>
                            append({
                              field_id: '',
                              op: 'eq',
                              valueText: '',
                            })
                          }
                        >
                          <Plus className='me-1 size-4' />
                          Add
                        </Button>
                      </div>
                      {!targetTableId && (
                        <p className='text-muted-foreground text-sm'>
                          Select a target table first.
                        </p>
                      )}
                      {filterFields.map((item, index) => (
                        <div
                          key={item.id}
                          className='grid gap-2 sm:grid-cols-[1fr_100px_1fr_auto]'
                        >
                          <FormField
                            control={form.control}
                            name={`filters.${index}.field_id`}
                            render={({ field }) => (
                              <FormItem>
                                <SelectDropdown
                                  isControlled
                                  defaultValue={field.value}
                                  onValueChange={field.onChange}
                                  placeholder='Field'
                                  items={targetFieldItems}
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`filters.${index}.op`}
                            render={({ field }) => (
                              <FormItem>
                                <SelectDropdown
                                  isControlled
                                  defaultValue={field.value}
                                  onValueChange={field.onChange}
                                  placeholder='Op'
                                  items={META_LINK_FILTER_OPS.map((op) => ({
                                    label: OP_LABELS[op],
                                    value: op,
                                  }))}
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`filters.${index}.valueText`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  {form.watch(`filters.${index}.op`) ===
                                  'in' ? (
                                    <textarea
                                      className='border-input bg-background min-h-16 w-full rounded-md border px-3 py-2 text-sm'
                                      placeholder={
                                        'one value per line\nor comma-separated'
                                      }
                                      {...field}
                                    />
                                  ) : (
                                    <Input placeholder='Value' {...field} />
                                  )}
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button
                            type='button'
                            variant='ghost'
                            size='icon'
                            className='text-destructive'
                            disabled={filterFields.length <= 1}
                            onClick={() => remove(index)}
                          >
                            <Trash2 className='size-4' />
                          </Button>
                        </div>
                      ))}
                      {form.formState.errors.filters?.root?.message ||
                      typeof form.formState.errors.filters?.message ===
                        'string' ? (
                        <p className='text-destructive text-sm'>
                          {form.formState.errors.filters?.root?.message ||
                            form.formState.errors.filters?.message}
                        </p>
                      ) : null}
                    </div>
                  )}
                </>
              )}

              {fieldType === 'attachment' && (
                <FormField
                  control={form.control}
                  name='multiple'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                      <div className='space-y-0.5'>
                        <FormLabel>Allow multiple files</FormLabel>
                        <FormDescription>
                          Upload multiple files (default on).
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='validator'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validator</FormLabel>
                    <div className='flex flex-wrap items-center gap-2'>
                      {badges.length ? (
                        badges.map((b) => (
                          <Badge key={b} variant='outline'>
                            {b}
                          </Badge>
                        ))
                      ) : (
                        <span className='text-muted-foreground text-sm'>
                          No rules
                        </span>
                      )}
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => setRuleOpen(true)}
                      >
                        Edit Rules
                      </Button>
                    </div>
                    <input type='hidden' {...field} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button
              type='submit'
              form='meta-field-form'
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RuleBuilderDialog
        open={ruleOpen}
        onOpenChange={setRuleOpen}
        value={validator}
        paramName={form.getValues('name') || 'field'}
        onApply={(rule) => {
          form.setValue('validator', rule, { shouldDirty: true })
          setRuleOpen(false)
        }}
      />
    </>
  )
}
