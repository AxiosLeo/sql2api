import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { SqlsDialogs } from './components/sqls-dialogs'
import { SqlsPrimaryButtons } from './components/sqls-primary-buttons'
import { SqlsProvider } from './components/sqls-provider'
import { SqlsTable } from './components/sqls-table'

const route = getRouteApi('/_authenticated/sqls/')

export function Sqls() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  return (
    <SqlsProvider>
      <Header fixed>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>SQL APIs</h2>
            <p className='text-muted-foreground'>
              Register SQL statements as invokable APIs.
            </p>
          </div>
          <SqlsPrimaryButtons />
        </div>
        <SqlsTable search={search} navigate={navigate} />
      </Main>

      <SqlsDialogs />
    </SqlsProvider>
  )
}
