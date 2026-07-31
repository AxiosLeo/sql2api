import { createFileRoute } from '@tanstack/react-router'
import { SqlEditorPage } from '@/features/sqls/editor'

export const Route = createFileRoute('/_authenticated/sqls/new')({
  component: NewSqlPage,
})

function NewSqlPage() {
  return <SqlEditorPage mode='create' />
}
