import { createFileRoute } from '@tanstack/react-router'
import { MetaTableFieldsPage } from '@/features/meta-tables/fields-page'

export const Route = createFileRoute('/_authenticated/meta-tables/$tableId/')({
  component: MetaTableFieldsRoute,
})

function MetaTableFieldsRoute() {
  const { tableId } = Route.useParams()
  return <MetaTableFieldsPage tableId={tableId} />
}
