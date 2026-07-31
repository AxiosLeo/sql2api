import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export type DateTimeRange = {
  from: Date
  to: Date
}

type DateTimeRangePickerProps = {
  value?: DateTimeRange
  onChange: (range: DateTimeRange | undefined) => void
  placeholder?: string
  className?: string
}

function toTimeValue(date: Date): string {
  return format(date, 'HH:mm')
}

function combineDateAndTime(date: Date, time: string, fallback: string): Date {
  const [hoursStr, minutesStr] = (time || fallback).split(':')
  const hours = Number(hoursStr)
  const minutes = Number(minutesStr)
  const next = new Date(date)
  next.setHours(
    Number.isFinite(hours) ? hours : 0,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0
  )
  return next
}

function buildRange(
  dateRange: DateRange | undefined,
  startTime: string,
  endTime: string
): DateTimeRange | undefined {
  if (!dateRange?.from || !dateRange?.to) return undefined
  return {
    from: combineDateAndTime(dateRange.from, startTime, '00:00'),
    to: combineDateAndTime(dateRange.to, endTime, '23:59'),
  }
}

export function DateTimeRangePicker({
  value,
  onChange,
  placeholder = 'All Time',
  className,
}: DateTimeRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    value ? { from: value.from, to: value.to } : undefined
  )
  const [startTime, setStartTime] = useState(
    value ? toTimeValue(value.from) : '00:00'
  )
  const [endTime, setEndTime] = useState(value ? toTimeValue(value.to) : '23:59')

  useEffect(() => {
    if (!open) return
    setDateRange(value ? { from: value.from, to: value.to } : undefined)
    setStartTime(value ? toTimeValue(value.from) : '00:00')
    setEndTime(value ? toTimeValue(value.to) : '23:59')
  }, [open, value])

  const draft = useMemo(
    () => buildRange(dateRange, startTime, endTime),
    [dateRange, startTime, endTime]
  )

  const isInvalid = Boolean(draft && draft.to.getTime() < draft.from.getTime())
  const canApply = Boolean(draft && !isInvalid)

  const label = value
    ? `${format(value.from, 'MMM d, yyyy HH:mm')} - ${format(value.to, 'MMM d, yyyy HH:mm')}`
    : placeholder

  const handleClear = () => {
    setDateRange(undefined)
    setStartTime('00:00')
    setEndTime('23:59')
    onChange(undefined)
    setOpen(false)
  }

  const handleApply = () => {
    if (!draft || isInvalid) return
    onChange(draft)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          data-empty={!value}
          className={cn(
            'data-[empty=true]:text-muted-foreground w-[340px] justify-start text-start font-normal',
            className
          )}
        >
          <CalendarIcon className='me-2 h-4 w-4 opacity-50' />
          <span className='truncate'>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0' align='start'>
        <Calendar
          mode='range'
          captionLayout='dropdown'
          numberOfMonths={1}
          selected={dateRange}
          onSelect={setDateRange}
          disabled={(date: Date) =>
            date > new Date() || date < new Date('1900-01-01')
          }
        />
        <div className='flex flex-col gap-3 border-t p-3'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='logs-range-start-time'>Start</Label>
              <Input
                id='logs-range-start-time'
                type='time'
                step={60}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={!dateRange?.from}
              />
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='logs-range-end-time'>End</Label>
              <Input
                id='logs-range-end-time'
                type='time'
                step={60}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={!dateRange?.to}
                aria-invalid={isInvalid || undefined}
              />
            </div>
          </div>
          {isInvalid ? (
            <p className='text-destructive text-sm'>
              End time must be after start time
            </p>
          ) : null}
          <div className='flex items-center justify-end gap-2'>
            <Button type='button' variant='ghost' size='sm' onClick={handleClear}>
              Clear
            </Button>
            <Button
              type='button'
              size='sm'
              disabled={!canApply}
              onClick={handleApply}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
