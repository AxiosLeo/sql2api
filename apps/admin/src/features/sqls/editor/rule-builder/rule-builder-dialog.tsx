import { useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { FORMAT_OPTIONS, RULE_TYPES, isStringLikeType } from './catalog'
import { parseRule, serializeRule } from './parse-serialize'
import type {
  EnumMode,
  FormatFlag,
  RangeMode,
  RuleDraft,
  RuleType,
} from './types'

type RuleBuilderDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onApply: (rule: string) => void
  paramName?: string
}

function EnumValuesInput({
  values,
  onChange,
}: {
  values: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function addValues(raw: string) {
    const parts = raw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    const next = [...values]
    for (const part of parts) {
      if (!next.includes(part)) next.push(part)
    }
    onChange(next)
    setDraft('')
  }

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap gap-1'>
        {values.length === 0 ? (
          <span className='text-muted-foreground text-xs'>No values yet</span>
        ) : (
          values.map((v) => (
            <Badge key={v} variant='secondary' className='gap-1 font-mono'>
              {v}
              <button
                type='button'
                className='hover:text-destructive cursor-pointer'
                onClick={() => onChange(values.filter((x) => x !== v))}
                aria-label={`Remove ${v}`}
              >
                <X className='size-3' />
              </button>
            </Badge>
          ))
        )}
      </div>
      <div className='flex gap-2'>
        <Input
          value={draft}
          placeholder='value or a,b,c'
          className='font-mono text-sm'
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addValues(draft)
            }
          }}
        />
        <Button
          type='button'
          variant='outline'
          size='icon'
          className='shrink-0 cursor-pointer'
          onClick={() => addValues(draft)}
          aria-label='Add enum value'
        >
          <Plus className='size-4' />
        </Button>
      </div>
    </div>
  )
}

type RuleBuilderBodyProps = {
  value: string
  onApply: (rule: string) => void
  onOpenChange: (open: boolean) => void
  paramName?: string
}

function RuleBuilderBody({
  value,
  onApply,
  onOpenChange,
  paramName,
}: RuleBuilderBodyProps) {
  const initial = parseRule(value)
  const [draft, setDraft] = useState<RuleDraft>(initial)
  const [advancedOpen, setAdvancedOpen] = useState(initial.needsAdvanced)
  const [advancedText, setAdvancedText] = useState(value)

  const preview = serializeRule(draft)
  const formatEnabled = isStringLikeType(draft.type)

  function update(patch: Partial<RuleDraft>) {
    setDraft((prev) => {
      const next = { ...prev, ...patch }
      setAdvancedText(serializeRule(next))
      return next
    })
  }

  function applyAdvancedBlur() {
    const parsed = parseRule(advancedText)
    setDraft(parsed)
    setAdvancedText(serializeRule(parsed))
    if (parsed.needsAdvanced) setAdvancedOpen(true)
  }

  function handleApply() {
    const rule = advancedOpen ? advancedText.trim() : preview
    const finalRule = rule || 'required|string'
    onApply(finalRule)
    onOpenChange(false)
  }

  return (
    <DialogContent className='max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-xl'>
      <DialogHeader className='border-b px-6 py-4 text-start'>
        <DialogTitle>
          Configure Rule
          {paramName ? (
            <span className='text-muted-foreground font-normal'>
              {' '}
              — {paramName}
            </span>
          ) : null}
        </DialogTitle>
        <DialogDescription>
          Build a validatorjs rule with selections. Minimal typing required.
        </DialogDescription>
      </DialogHeader>

      <div className='max-h-[min(60vh,520px)] space-y-5 overflow-y-auto px-6 py-4'>
        <div className='flex items-center justify-between gap-3'>
          <div className='space-y-0.5'>
            <Label htmlFor='rule-required'>Required</Label>
            <p className='text-muted-foreground text-xs'>
              Field must be present and non-empty
            </p>
          </div>
          <Switch
            id='rule-required'
            checked={draft.required}
            onCheckedChange={(checked) => update({ required: checked })}
          />
        </div>

        <div className='space-y-2'>
          <Label>Type</Label>
          <RadioGroup
            value={draft.type || '__none__'}
            onValueChange={(v) =>
              update({
                type: (v === '__none__' ? '' : v) as RuleType,
                formatFlags:
                  v === '__none__' || isStringLikeType(v as RuleType)
                    ? draft.formatFlags
                    : [],
              })
            }
            className='grid grid-cols-2 gap-2 sm:grid-cols-3'
          >
            <label
              className={cn(
                'hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                !draft.type && 'border-primary bg-muted/40'
              )}
            >
              <RadioGroupItem value='__none__' id='type-none' />
              <span>None</span>
            </label>
            {RULE_TYPES.map((t) => (
              <label
                key={t.value}
                className={cn(
                  'hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                  draft.type === t.value && 'border-primary bg-muted/40'
                )}
              >
                <RadioGroupItem value={t.value} id={`type-${t.value}`} />
                <span>{t.label}</span>
              </label>
            ))}
          </RadioGroup>
        </div>

        <div className='space-y-2'>
          <Label>Length / Range</Label>
          <Select
            value={draft.rangeMode}
            onValueChange={(v) => update({ rangeMode: v as RangeMode })}
          >
            <SelectTrigger className='w-full cursor-pointer'>
              <SelectValue placeholder='None' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='none'>None</SelectItem>
              <SelectItem value='min_max'>Min / Max</SelectItem>
              <SelectItem value='between'>Between</SelectItem>
              <SelectItem value='size'>Exact size</SelectItem>
            </SelectContent>
          </Select>
          {draft.rangeMode === 'min_max' && (
            <div className='grid grid-cols-2 gap-2'>
              <div className='space-y-1'>
                <Label className='text-xs'>Min</Label>
                <Input
                  type='number'
                  inputMode='decimal'
                  value={draft.min}
                  onChange={(e) => update({ min: e.target.value })}
                  placeholder='e.g. 1'
                />
              </div>
              <div className='space-y-1'>
                <Label className='text-xs'>Max</Label>
                <Input
                  type='number'
                  inputMode='decimal'
                  value={draft.max}
                  onChange={(e) => update({ max: e.target.value })}
                  placeholder='e.g. 100'
                />
              </div>
            </div>
          )}
          {draft.rangeMode === 'between' && (
            <div className='grid grid-cols-2 gap-2'>
              <div className='space-y-1'>
                <Label className='text-xs'>From</Label>
                <Input
                  type='number'
                  inputMode='decimal'
                  value={draft.betweenMin}
                  onChange={(e) => update({ betweenMin: e.target.value })}
                />
              </div>
              <div className='space-y-1'>
                <Label className='text-xs'>To</Label>
                <Input
                  type='number'
                  inputMode='decimal'
                  value={draft.betweenMax}
                  onChange={(e) => update({ betweenMax: e.target.value })}
                />
              </div>
            </div>
          )}
          {draft.rangeMode === 'size' && (
            <div className='space-y-1'>
              <Label className='text-xs'>Size</Label>
              <Input
                type='number'
                inputMode='decimal'
                value={draft.size}
                onChange={(e) => update({ size: e.target.value })}
                placeholder='Exact length or value'
              />
            </div>
          )}
        </div>

        <div className='space-y-2'>
          <Label>Enum</Label>
          <Select
            value={draft.enumMode}
            onValueChange={(v) => update({ enumMode: v as EnumMode })}
          >
            <SelectTrigger className='w-full cursor-pointer'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='none'>None</SelectItem>
              <SelectItem value='in'>In list (in:…)</SelectItem>
              <SelectItem value='not_in'>Not in list (not_in:…)</SelectItem>
            </SelectContent>
          </Select>
          {draft.enumMode !== 'none' && (
            <EnumValuesInput
              values={draft.enumValues}
              onChange={(enumValues) => update({ enumValues })}
            />
          )}
        </div>

        <div className='space-y-2'>
          <Label className={!formatEnabled ? 'text-muted-foreground' : ''}>
            Format constraints
          </Label>
          {!formatEnabled && (
            <p className='text-muted-foreground text-xs'>
              Available for string-like types only.
            </p>
          )}
          <div className='space-y-2'>
            {FORMAT_OPTIONS.map((opt) => {
              const checked = draft.formatFlags.includes(opt.value)
              return (
                <label
                  key={opt.value}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    !formatEnabled && 'opacity-50'
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={!formatEnabled}
                    onCheckedChange={(c) => {
                      const next: FormatFlag[] = c
                        ? [...draft.formatFlags, opt.value]
                        : draft.formatFlags.filter((f) => f !== opt.value)
                      update({ formatFlags: next })
                    }}
                  />
                  <span>{opt.label}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div className='space-y-2'>
          <div className='flex items-center justify-between gap-3'>
            <div className='space-y-0.5'>
              <Label htmlFor='rule-regex'>Regex pattern</Label>
              <p className='text-muted-foreground text-xs'>
                validatorjs <code>regex:/…/</code>
              </p>
            </div>
            <Switch
              id='rule-regex'
              checked={draft.regexEnabled}
              onCheckedChange={(checked) => update({ regexEnabled: checked })}
            />
          </div>
          {draft.regexEnabled && (
            <Input
              value={draft.regex}
              onChange={(e) => update({ regex: e.target.value })}
              placeholder='/^[a-z0-9_-]+$/'
              className='font-mono text-sm'
            />
          )}
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button
              type='button'
              variant='ghost'
              className='text-muted-foreground h-8 w-full cursor-pointer justify-between px-0'
            >
              <span className='text-sm'>Advanced (raw rule string)</span>
              <ChevronDown
                className={cn(
                  'size-4 transition-transform',
                  advancedOpen && 'rotate-180'
                )}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className='space-y-2'>
            {draft.unknownParts.length > 0 && (
              <p className='text-xs text-amber-600 dark:text-amber-400'>
                Contains rules not shown above:{' '}
                <code>{draft.unknownParts.join(' | ')}</code>. Edit raw string
                to keep them.
              </p>
            )}
            <Textarea
              value={advancedText}
              onChange={(e) => setAdvancedText(e.target.value)}
              onBlur={applyAdvancedBlur}
              className='min-h-20 font-mono text-sm'
              placeholder='required|string|min:1'
            />
          </CollapsibleContent>
        </Collapsible>
      </div>

      <DialogFooter className='bg-muted/30 gap-3 border-t px-6 py-4 sm:flex-col sm:space-x-0'>
        <div className='bg-background w-full rounded-md border px-3 py-2'>
          <p className='text-muted-foreground mb-1 text-[10px] tracking-wide uppercase'>
            Preview
          </p>
          <code className='block break-all font-mono text-sm'>
            {advancedOpen ? advancedText.trim() || '—' : preview || '—'}
          </code>
        </div>
        <div className='flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
          <DialogClose asChild>
            <Button type='button' variant='outline' className='cursor-pointer'>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type='button'
            className='cursor-pointer'
            onClick={handleApply}
          >
            Apply
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  )
}

export function RuleBuilderDialog({
  open,
  onOpenChange,
  value,
  onApply,
  paramName,
}: RuleBuilderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <RuleBuilderBody
          value={value}
          onApply={onApply}
          onOpenChange={onOpenChange}
          paramName={paramName}
        />
      ) : null}
    </Dialog>
  )
}
