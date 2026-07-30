import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ConnectionsDialogs } from './components/connections-dialogs'
import { ConnectionsPrimaryButtons } from './components/connections-primary-buttons'
import { ConnectionsProvider } from './components/connections-provider'
import { ConnectionsTable } from './components/connections-table'

const route = getRouteApi('/_authenticated/connections/')

export function Connections() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  return (
    <ConnectionsProvider>
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
            <h2 className='text-2xl font-bold tracking-tight'>Connections</h2>
            <p className='text-muted-foreground'>
              Manage database connections per application.
            </p>
          </div>
          <ConnectionsPrimaryButtons />
        </div>
        <ConnectionsTable search={search} navigate={navigate} />
      </Main>

      <ConnectionsDialogs />
    </ConnectionsProvider>
  )
}
