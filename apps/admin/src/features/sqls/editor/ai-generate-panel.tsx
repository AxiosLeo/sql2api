import { Loader2, Sparkles } from 'lucide-react'
import type { GenerateProgressEvent } from '@/api/sqls'
import type { ModelItem } from '@/api/models'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type AiGeneratePanelProps = {
  connectionId: string
  prompt: string
  onPromptChange: (value: string) => void
  models: ModelItem[]
  modelsLoading: boolean
  selectedModelIds: Set<string>
  onToggleModel: (id: string, checked: boolean) => void
  generating: boolean
  progress: GenerateProgressEvent[]
  onGenerate: () => void
}

export function AiGeneratePanel({
  connectionId,
  prompt,
  onPromptChange,
  models,
  modelsLoading,
  selectedModelIds,
  onToggleModel,
  generating,
  progress,
  onGenerate,
}: AiGeneratePanelProps) {
  if (!connectionId) {
    return (
      <p className='text-sm text-muted-foreground'>
        Select a connection first.
      </p>
    )
  }

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='ai-prompt'>Prompt</Label>
        <Textarea
          id='ai-prompt'
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder='e.g. Query all orders for a given user id'
          rows={3}
          className='min-h-20'
        />
      </div>

      <div className='flex flex-col gap-2'>
        <Label>Table models (optional context)</Label>
        {modelsLoading ? (
          <p className='text-sm text-muted-foreground'>Loading models...</p>
        ) : models.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            No models for this connection. Generate models first for better
            results.
          </p>
        ) : (
          <div className='max-h-40 flex flex-col gap-2 overflow-y-auto rounded-md border p-2'>
            {models.map((m) => (
              <label
                key={m.id}
                className='flex cursor-pointer items-center gap-2 text-sm'
              >
                <Checkbox
                  checked={selectedModelIds.has(m.id)}
                  onCheckedChange={(v) => onToggleModel(m.id, v === true)}
                />
                <span className='font-medium'>{m.table_name}</span>
                {m.comment ? (
                  <span className='text-muted-foreground'>— {m.comment}</span>
                ) : null}
              </label>
            ))}
          </div>
        )}
      </div>

      <Button
        type='button'
        variant='secondary'
        className='w-fit cursor-pointer'
        disabled={generating || !prompt.trim()}
        onClick={onGenerate}
      >
        {generating ? (
          <Loader2 className='animate-spin' data-icon='inline-start' />
        ) : (
          <Sparkles data-icon='inline-start' />
        )}
        {generating ? 'Generating...' : 'Generate'}
      </Button>

      {generating || progress.length > 0 ? (
        <div className='flex flex-col gap-1.5 rounded-md border bg-muted/40 p-3 text-sm'>
          <p className='text-xs font-medium text-muted-foreground'>
            Generation progress
          </p>
          <ol className='flex flex-col gap-1'>
            {progress.map((event, idx) => (
              <li
                key={`${event.stage}-${event.status}-${idx}`}
                className='flex flex-wrap items-center gap-2'
              >
                <Badge variant='outline' className='capitalize'>
                  {event.stage}
                </Badge>
                <span
                  className={
                    event.status === 'done'
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  }
                >
                  {event.message ||
                    (event.status === 'start' ? 'In progress…' : 'Done')}
                </span>
                {event.tables && event.tables.length > 0 ? (
                  <span className='text-xs text-muted-foreground'>
                    ({event.tables.join(', ')})
                  </span>
                ) : null}
              </li>
            ))}
            {generating && progress.length === 0 ? (
              <li className='text-muted-foreground'>Starting…</li>
            ) : null}
          </ol>
        </div>
      ) : null}
    </div>
  )
}
