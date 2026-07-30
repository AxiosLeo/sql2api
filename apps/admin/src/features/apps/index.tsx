import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { AppsDialogs } from './components/apps-dialogs'
import { AppsPrimaryButtons } from './components/apps-primary-buttons'
import { AppsProvider } from './components/apps-provider'
import { AppsTable } from './components/apps-table'

const route = getRouteApi('/_authenticated/apps/')

export function Apps() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  return (
    <AppsProvider>
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
            <h2 className='text-2xl font-bold tracking-tight'>Applications</h2>
            <p className='text-muted-foreground'>
              Manage applications and their API keys.
            </p>
          </div>
          <AppsPrimaryButtons />
        </div>
        <AppsTable search={search} navigate={navigate} />
      </Main>

      <AppsDialogs />
    </AppsProvider>
  )
}
