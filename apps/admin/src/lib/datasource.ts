/**
 * Datasource type catalog for the admin UI.
 * Keep in sync with apps/services/src/types.ts DATASOURCE_TYPES.
 */

export const DATASOURCE_TYPES = [
  'mysql',
  'mariadb',
  'tidb',
  'oceanbase',
  'doris',
  'starrocks',
  'postgresql',
  'cockroachdb',
  'yugabytedb',
  'opengauss',
  'kingbase',
  'oracle',
  'sqlserver',
] as const

export type DatasourceType = (typeof DATASOURCE_TYPES)[number]

export type DatasourceProtocol =
  | 'mysql'
  | 'postgresql'
  | 'oracle'
  | 'sqlserver'

export const DATASOURCE_PROTOCOLS: Record<DatasourceType, DatasourceProtocol> =
  {
    mysql: 'mysql',
    mariadb: 'mysql',
    tidb: 'mysql',
    oceanbase: 'mysql',
    doris: 'mysql',
    starrocks: 'mysql',
    postgresql: 'postgresql',
    cockroachdb: 'postgresql',
    yugabytedb: 'postgresql',
    opengauss: 'postgresql',
    kingbase: 'postgresql',
    oracle: 'oracle',
    sqlserver: 'sqlserver',
  }

export function datasourceProtocol(
  type: DatasourceType | string | undefined | null
): DatasourceProtocol {
  if (type && type in DATASOURCE_PROTOCOLS) {
    return DATASOURCE_PROTOCOLS[type as DatasourceType]
  }
  return 'mysql'
}

export const DATASOURCE_LABELS: Record<DatasourceType, string> = {
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  tidb: 'TiDB',
  oceanbase: 'OceanBase',
  doris: 'Apache Doris',
  starrocks: 'StarRocks',
  postgresql: 'PostgreSQL',
  cockroachdb: 'CockroachDB',
  yugabytedb: 'YugabyteDB',
  opengauss: 'openGauss',
  kingbase: 'KingbaseES',
  oracle: 'Oracle',
  sqlserver: 'SQL Server',
}

/** Default TCP ports used when switching type in the connection form. */
export const DATASOURCE_DEFAULT_PORTS: Record<DatasourceType, number> = {
  mysql: 3306,
  mariadb: 3306,
  tidb: 4000,
  oceanbase: 2881,
  doris: 9030,
  starrocks: 9030,
  postgresql: 5432,
  cockroachdb: 26257,
  yugabytedb: 5433,
  opengauss: 5432,
  kingbase: 54321,
  oracle: 1521,
  sqlserver: 1433,
}

export const DATASOURCE_SELECT_ITEMS = DATASOURCE_TYPES.map((value) => ({
  label: DATASOURCE_LABELS[value],
  value,
}))

export function isDatasourceType(value: string): value is DatasourceType {
  return (DATASOURCE_TYPES as readonly string[]).includes(value)
}

/** Whether probe can list catalogs/databases for this type. Oracle uses Service Name. */
export function supportsDatabaseListing(
  type: DatasourceType | string | undefined | null
): boolean {
  if (!type || !isDatasourceType(type)) return false
  return datasourceProtocol(type) !== 'oracle'
}
