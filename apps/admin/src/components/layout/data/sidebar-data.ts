import {
  LayoutDashboard,
  Package,
  Command,
  Database,
  Table2,
  FileCode2,
  ScrollText,
  Settings2,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'satnaing',
    email: 'satnaingdev@gmail.com',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [
    {
      name: 'SQL2API',
      logo: Command,
      plan: 'Admin Console',
    },
  ],
  navGroups: [
    {
      title: 'General',
      items: [
        {
          title: 'Dashboard',
          url: '/',
          icon: LayoutDashboard,
        },
        {
          title: 'Apps',
          url: '/apps',
          icon: Package,
        },
        {
          title: 'Connections',
          url: '/connections',
          icon: Database,
        },
        {
          title: 'Models',
          url: '/models',
          icon: Table2,
        },
        {
          title: 'SQL APIs',
          url: '/sqls',
          icon: FileCode2,
        },
        {
          title: 'Invocation Logs',
          url: '/logs',
          icon: ScrollText,
        },
      ],
    },
    {
      title: 'System',
      items: [
        {
          title: 'Settings',
          url: '/system',
          icon: Settings2,
        },
      ],
    },
  ],
}
