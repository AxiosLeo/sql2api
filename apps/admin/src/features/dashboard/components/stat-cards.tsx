import { type LucideIcon } from 'lucide-react'
import { Activity, CircleCheckBig, FileCode2, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { type StatsOverview } from '@/api/stats'

const numberFormat = new Intl.NumberFormat('en-US')

interface StatCardDef {
  label: string
  value: string
  sub: string
  icon: LucideIcon
  boxClass: string
}

function buildCards(overview: StatsOverview): StatCardDef[] {
  const { invocations } = overview
  const successRate =
    invocations.total > 0
      ? `${((invocations.success / invocations.total) * 100).toFixed(1)}%`
      : '—'

  return [
    {
      label: 'Apps',
      value: numberFormat.format(overview.apps),
      sub: `${numberFormat.format(overview.connections)} connections`,
      icon: Package,
      boxClass: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
    },
    {
      label: 'SQL APIs',
      value: numberFormat.format(overview.sqls),
      sub: `${numberFormat.format(overview.models)} table models`,
      icon: FileCode2,
      boxClass:
        'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400',
    },
    {
      label: 'Invocations (30d)',
      value: numberFormat.format(invocations.total),
      sub: `${numberFormat.format(invocations.success)} success · ${numberFormat.format(invocations.failed)} failed`,
      icon: Activity,
      boxClass:
        'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400',
    },
    {
      label: 'Success Rate (30d)',
      value: successRate,
      sub:
        invocations.total > 0
          ? `Avg latency ${numberFormat.format(invocations.avg_latency_ms)}ms`
          : 'No invocations yet',
      icon: CircleCheckBig,
      boxClass:
        'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400',
    },
  ]
}

function StatCardSkeleton() {
  return (
    <Card className='py-5'>
      <CardContent className='flex items-center gap-4 px-5'>
        <Skeleton className='h-12 w-12 shrink-0 rounded-lg' />
        <div className='min-w-0 flex-1 space-y-2'>
          <Skeleton className='h-4 w-24' />
          <Skeleton className='h-7 w-16' />
          <Skeleton className='h-3 w-28' />
        </div>
      </CardContent>
    </Card>
  )
}

export function StatCards({
  overview,
  isLoading,
}: {
  overview: StatsOverview | undefined
  isLoading: boolean
}) {
  if (isLoading || !overview) {
    return (
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      {buildCards(overview).map((card) => (
        <Card
          key={card.label}
          className='py-5 transition-shadow hover:shadow-md'
        >
          <CardContent className='flex items-center gap-4 px-5'>
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg',
                card.boxClass
              )}
            >
              <card.icon className='h-6 w-6' />
            </div>
            <div className='min-w-0'>
              <p className='text-muted-foreground truncate text-sm font-medium'>
                {card.label}
              </p>
              <p className='mt-0.5 text-2xl font-semibold tabular-nums'>
                {card.value}
              </p>
              <p className='text-muted-foreground truncate text-xs'>
                {card.sub}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
