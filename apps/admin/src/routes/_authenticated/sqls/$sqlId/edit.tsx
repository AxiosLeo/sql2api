import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { toast } from 'sonner'
import { getSql } from '@/api/sqls'
import { SqlEditorPage } from '@/features/sqls/editor'

export const Route = createFileRoute('/_authenticated/sqls/$sqlId/edit')({
  component: EditSqlPage,
})

function EditSqlPage() {
  const { sqlId } = Route.useParams()
  const navigate = useNavigate()

  const sqlQuery = useQuery({
    queryKey: ['sqls', sqlId],
    queryFn: () => getSql(sqlId),
    retry: false,
  })

  useEffect(() => {
    if (!sqlQuery.isError) return
    const err = sqlQuery.error
    const status = err instanceof AxiosError ? err.response?.status : undefined
    if (status === 404) {
      toast.error('SQL API not found.')
      void navigate({ to: '/sqls' })
    }
  }, [sqlQuery.isError, sqlQuery.error, navigate])

  const notFound =
    sqlQuery.isError &&
    sqlQuery.error instanceof AxiosError &&
    sqlQuery.error.response?.status === 404

  return (
    <SqlEditorPage
      mode='edit'
      sqlId={sqlId}
      initial={sqlQuery.data ?? null}
      loading={sqlQuery.isLoading}
      loadError={notFound}
    />
  )
}
