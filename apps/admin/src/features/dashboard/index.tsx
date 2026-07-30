import { useQuery } from '@tanstack/react-query'
import {
  fetchStatsLogs,
  fetchStatsOverview,
  fetchStatsSummary,
} from '@/api/stats'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { InvocationsChart } from './components/invocations-chart'
import { RecentInvocations } from './components/recent-invocations'
import { StatCards } from './components/stat-cards'

const REFRESH_INTERVAL_MS = 30_000
const SUMMARY_DAYS = 30
const RECENT_LOGS_SIZE = 8

export function Dashboard() {
  const overviewQuery = useQuery({
    queryKey: ['stats', 'overview'],
    queryFn: fetchStatsOverview,
    refetchInterval: REFRESH_INTERVAL_MS,
  })

  const summaryQuery = useQuery({
    queryKey: ['stats', 'summary', SUMMARY_DAYS],
    queryFn: () => fetchStatsSummary({ days: SUMMARY_DAYS }),
    refetchInterval: REFRESH_INTERVAL_MS,
  })

  const logsQuery = useQuery({
    queryKey: ['stats', 'logs', RECENT_LOGS_SIZE],
    queryFn: () => fetchStatsLogs({ size: RECENT_LOGS_SIZE }),
    refetchInterval: REFRESH_INTERVAL_MS,
  })

  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <div className='ms-auto flex items-center space-x-4'>
          <Search />
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      {/* ===== Main ===== */}
      <Main>
        <div className='mb-2 flex items-center justify-between space-y-2'>
          <h1 className='text-2xl font-bold tracking-tight'>Dashboard</h1>
        </div>
        <div className='space-y-4'>
          <StatCards
            overview={overviewQuery.data}
            isLoading={overviewQuery.isPending}
          />
          <div className='grid grid-cols-1 gap-4 lg:grid-cols-7'>
            <Card className='col-span-1 lg:col-span-4'>
              <CardHeader>
                <CardTitle>Invocations</CardTitle>
                <CardDescription>
                  Daily invocations over the last {SUMMARY_DAYS} days.
                </CardDescription>
              </CardHeader>
              <CardContent className='flex min-h-0 flex-1 flex-col ps-2'>
                <InvocationsChart
                  summary={summaryQuery.data}
                  days={SUMMARY_DAYS}
                  isLoading={summaryQuery.isPending}
                />
              </CardContent>
            </Card>
            <Card className='col-span-1 lg:col-span-3'>
              <CardHeader>
                <CardTitle>Recent Invocations</CardTitle>
                <CardDescription>
                  {logsQuery.data
                    ? `${logsQuery.data.total} calls logged in the last 30 days.`
                    : 'Latest API calls across all apps.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RecentInvocations
                  logs={logsQuery.data?.list}
                  isLoading={logsQuery.isPending}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </Main>
    </>
  )
}
