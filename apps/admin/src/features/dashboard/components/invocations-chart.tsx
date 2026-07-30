import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { type StatsSummary } from '@/api/stats'

const DAY_MS = 24 * 60 * 60 * 1000

interface ChartPoint {
  date: string
  label: string
  success: number
  failed: number
}

/** Build a dense series for the last `days` days (UTC buckets, matching the API). */
function buildSeries(summary: StatsSummary, days: number): ChartPoint[] {
  const byDate = new Map(summary.daily.map((d) => [d.date, d]))
  const points: ChartPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10)
    const stat = byDate.get(date)
    points.push({
      date,
      label: date.slice(5),
      success: stat?.success ?? 0,
      failed: stat?.failed ?? 0,
    })
  }
  return points
}

interface TooltipPayloadItem {
  value?: number
  payload?: ChartPoint
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className='bg-popover text-popover-foreground rounded-md border px-3 py-2 text-xs shadow-md'>
      <p className='mb-1 font-medium'>{point.date}</p>
      <p>Total: {point.success + point.failed}</p>
      <p className='text-green-600 dark:text-green-400'>
        Success: {point.success}
      </p>
      <p className='text-red-600 dark:text-red-400'>Failed: {point.failed}</p>
    </div>
  )
}

export function InvocationsChart({
  summary,
  days = 30,
  isLoading,
}: {
  summary: StatsSummary | undefined
  days?: number
  isLoading: boolean
}) {
  const data = useMemo(
    () => (summary ? buildSeries(summary, days) : []),
    [summary, days]
  )

  if (isLoading || !summary) {
    return <Skeleton className='min-h-[320px] w-full flex-1' />
  }

  if (summary.total === 0) {
    return (
      <div className='text-muted-foreground flex min-h-[320px] flex-1 items-center justify-center text-sm'>
        No invocations in the last {days} days.
      </div>
    )
  }

  return (
    <div className='relative min-h-[320px] w-full flex-1'>
      <div className='absolute inset-0'>
        <ResponsiveContainer width='100%' height='100%'>
          <BarChart data={data}>
            <XAxis
              dataKey='label'
              stroke='#888888'
              fontSize={12}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis
              stroke='#888888'
              fontSize={12}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={40}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: 'currentColor', opacity: 0.08 }}
            />
            <Bar
              dataKey='success'
              stackId='invocations'
              fill='currentColor'
              className='fill-primary'
            />
            <Bar
              dataKey='failed'
              stackId='invocations'
              fill='currentColor'
              radius={[4, 4, 0, 0]}
              className='fill-red-400 dark:fill-red-500'
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
