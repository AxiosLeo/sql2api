# sql2api

将注册的 SQL 语句转成带鉴权的 HTTP API（客户数据源：MySQL / PostgreSQL 协议兼容库、Oracle、SQL Server）。pnpm monorepo（pnpm >= 9，Node >= 20）。

## 目录结构

- `apps/services` — 后端 API 服务（@axiosleo/koapp，默认端口 13334）
  - `src/modules/` — 业务模块：admin、app、connection、model、sql、invoke、stat、docs
  - `src/middlewares/` — `auth.ts`（Bearer Api-Key）、`admin-auth.ts`（Session）
  - `src/services/` — 共享服务：`sqlite.ts`（元数据库）、`datasource.ts`（客户库连接）、`ai.ts`（本地 LLM）、`retention.ts`（日志清理）、`openapi-spec.ts`（OpenAPI 合并与动态生成）、`openapi-specs/`（手写模块规范片段）
- `apps/admin` — 管理台（React 19 + Vite + TanStack Router/Query + shadcn/ui）
- `packages/commands` — CLI 命令实现（纯 JS，@axiosleo/cli-tool）：`app.js`、`apikey.js`
- `bin/sql2api.js` — CLI 入口（`sql2api app` / `sql2api apikey`）
- `scripts/` — 模型下载脚本、DB seed SQL

## 关键事实

- 元数据（应用、Api-Key、连接、模型、SQL、日志）存内部 SQLite，默认 `./data/sql2api.db`；客户数据源支持 MySQL / PostgreSQL 及协议兼容库（MariaDB、TiDB、OceanBase、Doris、StarRocks、CockroachDB、YugabyteDB、openGauss、KingbaseES），以及 Oracle（`oracledb` thin）与 SQL Server（`mssql`）；各自独立 `DatasourceType`，驱动按协议复用或专用适配器
- 两套 API 面：`/openapi/*` 用 Bearer Api-Key（`sk2a_…`，明文仅创建时展示一次）；`/api/*` 用 Session cookie（管理台）
- SQL 调用入口：`/openapi/invoke/{uuid}`；HTTP 方法映射：SELECT→GET、INSERT→POST、UPDATE→PATCH、多语句/CALL→complex(POST)；禁止 DROP/DELETE/TRUNCATE；`draft` / `disabled` 状态不可 invoke，仅 `enabled` 可调用且会出现在合并 OpenAPI 中
- 合并 OpenAPI 直链：`GET /openapi.json`（Bearer 或 `?api_key=`），返回静态模块规范 + 当前应用 enabled SQL 的动态接口；管理台 `GET /api/openapi.json` 与 API Docs 页面；单条 `GET /sqls/{id}/openapi`
- AI 能力（可选）：支持本地 GGUF（node-llama-cpp，`LLAMA_MODEL_PATH`）或私有 Ollama（`AI_PROVIDER=ollama` + `OLLAMA_*`）；Admin「System Settings」可在线覆盖环境变量，未配置时回退 env
- 数据源连接密码用 AES-256-GCM 加密存储

## 常用命令

- `pnpm install` — 安装依赖
- `pnpm build` / `pnpm test` / `pnpm lint` — 递归执行各包对应脚本
- `docker compose up -d` — 启动本地测试库（MySQL 8 + PostgreSQL 16）
- 后端开发：`apps/services` 下 `pnpm dev`（nodemon）；前端开发：`apps/admin` 下 `pnpm dev`（vite）

## 领域约定

后端与前端的详细编码约定见 `.cursor/rules/`（按文件路径自动生效）；koapp 框架 API 用法见 `.cursor/skills/koapp*`。
