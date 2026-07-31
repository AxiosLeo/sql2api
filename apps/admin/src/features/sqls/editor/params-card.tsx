import { useState } from 'react'
import { useFormContext, type Control } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { RuleBuilderDialog } from './rule-builder/rule-builder-dialog'
import { RuleSummary } from './rule-builder/rule-summary'
import type { SqlEditorForm } from './types'

type ParamsCardProps = {
  control: Control<SqlEditorForm>
  fields: Array<{ id: string }>
  onAdd: () => void
  onRemove: (index: number) => void
}

export function ParamsCard({
  control,
  fields,
  onAdd,
  onRemove,
}: ParamsCardProps) {
  const { setValue, watch } = useFormContext<SqlEditorForm>()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const params = watch('params')
  const editingParam =
    openIndex !== null ? (params?.[openIndex] ?? null) : null

  return (
    <Card>
      <CardHeader className='border-b'>
        <CardTitle>Parameters</CardTitle>
        <CardDescription>
          Match <code>:name</code> placeholders in SQL.
        </CardDescription>
        <CardAction>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='cursor-pointer'
            onClick={onAdd}
          >
            <Plus data-icon='inline-start' />
            Add Param
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='pt-6'>
        {fields.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            No parameters. Use <code>:name</code> placeholders in SQL and add
            matching params.
          </p>
        ) : (
          <div className='flex flex-col gap-3'>
            {fields.map((field, index) => (
              <div
                key={field.id}
                className='grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-[1fr_minmax(0,1.4fr)_1fr_1fr_auto]'
              >
                <FormField
                  control={control}
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
                  control={control}
                  name={`params.${index}.rule`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel className='text-xs'>Rule</FormLabel>
                      <FormControl>
                        <RuleSummary
                          value={f.value}
                          onConfigure={() => setOpenIndex(index)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name={`params.${index}.description`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel className='text-xs'>Description</FormLabel>
                      <FormControl>
                        <Input placeholder='Optional' {...f} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name={`params.${index}.default`}
                  render={({ field: f }) => (
                    <FormItem>
                      <FormLabel className='text-xs'>Default</FormLabel>
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
                    className='cursor-pointer'
                    onClick={() => onRemove(index)}
                  >
                    <Trash2 className='text-destructive' />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <RuleBuilderDialog
        open={openIndex !== null}
        onOpenChange={(open) => {
          if (!open) setOpenIndex(null)
        }}
        value={editingParam?.rule ?? ''}
        paramName={editingParam?.name || undefined}
        onApply={(rule) => {
          if (openIndex === null) return
          setValue(`params.${openIndex}.rule`, rule, {
            shouldDirty: true,
            shouldValidate: true,
          })
        }}
      />
    </Card>
  )
}
