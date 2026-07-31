# 数据源扩展规划

> 记录时间：2026-07-31
>
> 客户数据源以独立 `DatasourceType` 注册；MySQL / PostgreSQL 协议兼容库复用 `mysql2` / `pg`；Oracle / SQL Server 使用专用驱动适配器。

## 现状与扩展点

当前架构中，数据源相关的扩展点非常集中：

- `apps/services/src/types.ts` — `DATASOURCE_TYPES` / `DatasourceType`、`DATASOURCE_PROTOCOLS` 协议映射（`mysql` / `postgresql` / `oracle` / `sqlserver`）
- `apps/services/src/services/datasource.ts` — `DatasourceAdapter` + `PROTOCOL_ADAPTERS` 按协议注册，再映射到各 type
  - `testConnection`（测试连接）
  - `listTables` / `describeTables`（元数据自省）
  - `query` / `execute`（单语句执行）
  - `executeScript`（多语句事务执行）
- 参数统一使用 `:name` 命名占位符；MySQL 协议走 `namedPlaceholders`，PG 协议转 `$n`，SQL Server 转 `@name`，Oracle 原生 `:name`
- `apps/services/src/modules/sql/sql.model.ts` — SQL 方言分析（`parserDatabase()`；Oracle 用 MySQL best-effort）
- `apps/services/src/services/ai.ts` — 按 dialect 显示名生成 AI 提示词

---

## 第一档：协议兼容库（几乎零成本） — **已实施**

这些库直接复用现有 `mysql2` / `pg` 驱动；每个库有独立 Type，驱动侧按协议分发并预留按类型覆写位。

| Type | 复用协议/驱动 | 说明 |
|---|---|---|
| `mariadb` | MySQL（`mysql2`） | 完全兼容；parser 使用 MariaDB 方言 |
| `tidb` | MySQL | 分布式场景常见 |
| `oceanbase` | MySQL | OceanBase MySQL 模式 |
| `doris` | MySQL | 分析型，SELECT 场景适合 sql2api |
| `starrocks` | MySQL | 分析型 |
| `cockroachdb` | PostgreSQL（`pg`） | 分布式 PG |
| `yugabytedb` | PostgreSQL | 分布式 PG |
| `opengauss` | PostgreSQL | 国产化替代 |
| `kingbase` | PostgreSQL | 人大金仓 |

托管形态（PolarDB、Supabase、Neon、云 RDS 等）不单列 Type，用户直接选择 `mysql` / `postgresql`。

**注意点**：

- 元数据查询可能有细微差异（如 TiDB 的 `information_schema`、openGauss 的 `pg_class`），适配器注册表已预留按 type 覆写位。
- Doris / StarRocks 为 OLAP，多语句事务语义可能受限，后续可按 type 覆写 `executeScript`。

## 第二档：需要新驱动，但架构完全适配

| 数据库 | Type | 驱动 | 状态 |
|---|---|---|---|
| Oracle | `oracle` | `oracledb`（thin） | **已实施** — `:name` 原生绑定；`database` 字段为 Service Name；元数据走 `USER_*` |
| SQL Server | `sqlserver` | `mssql` | **已实施** — `:name` → `@name`；元数据走 `INFORMATION_SCHEMA`；默认 `encrypt` + `trustServerCertificate` |
| SQLite / DuckDB | — | `better-sqlite3` / `duckdb` | 待实施 — 文件型库需调整 `DatasourceConfig`（host/port 可选或 `file_path`） |

## 第三档：能做但语义有折损

| 数据库 | 驱动 | 折损点 |
|---|---|---|
| ClickHouse | `@clickhouse/client` | 分析型只读 API 场景与 sql2api 定位非常契合；但无真正事务，`executeScript` 的 BEGIN/ROLLBACK 语义需单独处理（如禁用多语句或不承诺回滚） |

**不建议支持**：MongoDB、Redis 等非 SQL 存储，与项目「注册 SQL 转 API」的核心模型冲突。

---

## 新增一种数据库的改动清单

| 位置 | 改动 |
|---|---|
| `apps/services/src/types.ts` | 扩展 `DATASOURCE_TYPES` / 协议映射 / 标签 |
| `apps/services/src/modules/connection/connection.model.ts` | `DATASOURCE_TYPE_IN_RULE` 自动生成校验规则 |
| `apps/services/src/services/datasource.ts` | 在 `PROTOCOL_ADAPTERS` / `adapters` 注册表挂上新 type |
| `apps/services/src/services/sqlite.ts` | `CONNECTIONS_TYPE_CHECK` + `migrateConnectionsTypeCheck` |
| `apps/services/src/modules/sql/sql.model.ts` | `parserDatabase()` 方言映射 |
| `apps/services/src/services/ai.ts` | `DATASOURCE_LABELS` 提示词显示名 |
| `apps/services/src/services/openapi-specs/openapi.connection.json` | `DatasourceType` 枚举 |
| `apps/admin/src/lib/datasource.ts` | 前端类型清单、默认端口、label |
| `apps/admin` 连接表单 / 列徽章 / SQL 编辑器 | 类型选择与方言（CodeMirror / sql-formatter） |
| `docker-compose.yml` + `scripts/` | 本地测试库与 seed SQL（按需） |

## 优先级建议

1. ~~**先零成本放开 MySQL / PG 协议兼容库**~~ — 已完成（第一档）
2. ~~**再做 Oracle 和 SQL Server**~~ — 已完成（第二档前两项）
3. **视需求做 SQLite / DuckDB**（文件型配置形态）
4. **最后视需求考虑 ClickHouse**（需先解决 `executeScript` 事务语义问题）
