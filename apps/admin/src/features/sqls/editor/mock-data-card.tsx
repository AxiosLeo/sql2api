import { AlignLeft, Loader2, Sparkles } from 'lucide-react'
import type { Control } from 'react-hook-form'
import { JsonEditor } from '@/components/json-editor'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import type { SqlEditorForm } from './types'

type MockDataCardProps = {
  control: Control<SqlEditorForm>
  mockEnabled: boolean
  mockData: string
  canGenerate: boolean
  generating: boolean
  onFormat: () => void
  onGenerate: () => void
}

export function MockDataCard({
  control,
  mockEnabled,
  mockData,
  canGenerate,
  generating,
  onFormat,
  onGenerate,
}: MockDataCardProps) {
  return (
    <Card>
      <CardHeader className='border-b'>
        <CardTitle>Mock Data</CardTitle>
        <CardDescription>
          When enabled, invoke returns this JSON instead of executing SQL.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4 pt-6'>
        <FormField
          control={control}
          name='mock_enabled'
          render={({ field }) => (
            <FormItem className='flex flex-row items-center justify-between rounded-lg border p-4'>
              <div className='space-y-0.5'>
                <FormLabel className='text-base'>Enable mock</FormLabel>
                <FormDescription>
                  Skip the database and return the mock payload below.
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

        {mockEnabled ? (
          <div className='flex flex-col gap-3'>
            <div className='flex items-center justify-end gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-8 cursor-pointer'
                disabled={!mockData.trim() || generating}
                onClick={onFormat}
              >
                <AlignLeft />
                Format
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='h-8 cursor-pointer'
                disabled={!canGenerate || generating}
                onClick={onGenerate}
              >
                {generating ? (
                  <Loader2 className='animate-spin' />
                ) : (
                  <Sparkles />
                )}
                {generating ? 'Generating...' : 'Generate with AI'}
              </Button>
            </div>
            <FormField
              control={control}
              name='mock_data'
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <JsonEditor
                      value={field.value}
                      onChange={field.onChange}
                      minHeight='240px'
                    />
                  </FormControl>
                  <FormDescription>
                    Shape should match the real invoke payload for this SQL
                    type (e.g. select → rows + row_count).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
