import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { MetaTablesDialogs } from './components/meta-tables-dialogs'
import { MetaTablesPrimaryButtons } from './components/meta-tables-primary-buttons'
import { MetaTablesProvider } from './components/meta-tables-provider'
import { MetaTablesTable } from './components/meta-tables-table'

const route = getRouteApi('/_authenticated/meta-tables/')

export function MetaTables() {
  const search = route.useSearch()
  const navigate = route.useNavigate()

  return (
    <MetaTablesProvider>
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
            <h2 className='text-2xl font-bold tracking-tight'>Meta Tables</h2>
            <p className='text-muted-foreground'>
              Manage metadata tables and their dynamic fields for Meta2API.
            </p>
          </div>
          <MetaTablesPrimaryButtons />
        </div>
        <MetaTablesTable search={search} navigate={navigate} />
      </Main>

      <MetaTablesDialogs />
    </MetaTablesProvider>
  )
}
