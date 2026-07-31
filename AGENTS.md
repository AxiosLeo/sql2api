# sql2api

将注册的 SQL 语句转成带鉴权的 HTTP API（数据源仅 MySQL / PostgreSQL）。pnpm monorepo（pnpm >= 9，Node >= 20）。

## 目录结构

- `apps/services` — 后端 API 服务（@axiosleo/koapp，默认端口 13334）
  - `src/modules/` — 业务模块：admin、app、connection、model、sql、invoke、stat
  - `src/middlewares/` — `auth.ts`（Bearer Api-Key）、`admin-auth.ts`（Session）
  - `src/services/` — 共享服务：`sqlite.ts`（元数据库）、`datasource.ts`（客户库连接）、`ai.ts`（本地 LLM）、`retention.ts`（日志清理）
- `apps/admin` — 管理台（React 19 + Vite + TanStack Router/Query + shadcn/ui）
- `packages/commands` — CLI 命令实现（纯 JS，@axiosleo/cli-tool）：`app.js`、`apikey.js`
- `bin/sql2api.js` — CLI 入口（`sql2api app` / `sql2api apikey`）
- `scripts/` — 模型下载脚本、DB seed SQL
- `docs/` — OpenAPI JSON 规范

## 关键事实

- 元数据（应用、Api-Key、连接、模型、SQL、日志）存内部 SQLite，默认 `./data/sql2api.db`；客户数据源仅支持 MySQL / PostgreSQL
- 两套 API 面：`/openapi/*` 用 Bearer Api-Key（`sk2a_…`，明文仅创建时展示一次）；`/api/*` 用 Session cookie（管理台）
- SQL 调用入口：`/openapi/invoke/{uuid}`；HTTP 方法映射：SELECT→GET、INSERT→POST、UPDATE→PATCH、多语句/CALL→complex(POST)；禁止 DROP/DELETE/TRUNCATE
- AI 能力（可选）：node-llama-cpp 加载本地 GGUF 模型，用于 SQL 生成与审查
- 数据源连接密码用 AES-256-GCM 加密存储

## 常用命令

- `pnpm install` — 安装依赖
- `pnpm build` / `pnpm test` / `pnpm lint` — 递归执行各包对应脚本
- `docker compose up -d` — 启动本地测试库（MySQL 8 + PostgreSQL 16）
- 后端开发：`apps/services` 下 `pnpm dev`（nodemon）；前端开发：`apps/admin` 下 `pnpm dev`（vite）

## 领域约定

后端与前端的详细编码约定见 `.cursor/rules/`（按文件路径自动生效）；koapp 框架 API 用法见 `.cursor/skills/koapp*`。
