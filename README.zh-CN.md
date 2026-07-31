# sql2api

[English](./README.md) | **简体中文**

将已注册的 SQL 语句转换为基于 MySQL / PostgreSQL 协议兼容库、Oracle、SQL Server 的、带鉴权的 HTTP API。

创建应用、添加数据库连接、用命名参数注册 SQL，即可通过 `/openapi/invoke/{uuid}` 调用 —— 可选 Admin Console，以及用于 SQL 生成/审查的本地 LLM。

## 功能特性

- **SQL → HTTP API** — 注册一次 SQL，通过 Bearer Api-Key 调用。方法映射：`SELECT` → `GET`、`INSERT` → `POST`、`UPDATE` → `PATCH`、多语句 / `CALL` → `complex`（`POST`）。静态审计禁止 `DROP` / `DELETE` / `TRUNCATE`
- **应用与 Api-Key 管理** — 多租户应用，密钥格式 `sk2a_…`（明文仅在创建时展示一次）
- **连接管理** — 支持 MySQL / PostgreSQL 及协议兼容库（MariaDB、TiDB、OceanBase、Doris、StarRocks、CockroachDB、YugabyteDB、openGauss、KingbaseES），以及 Oracle、SQL Server；密码使用 AES-256-GCM 加密存储
- **模型元数据** — 同步表/字段信息，供 AI 上下文与文档使用
- **AI 辅助 SQL**（可选）— 通过 `node-llama-cpp` 加载本地 GGUF 模型，支持生成与审查（语法、性能与安全）
- **调用日志** — 请求历史记录，支持按保留天数自动清理
- **Admin Console** — React 管理后台：应用、连接、模型、SQL API、调用日志
- **CLI** — `sql2api app` / `sql2api apikey`，便于脚本化运维

## 架构

```
sql2api/
├── apps/
│   ├── services/     # HTTP API 后端（@axiosleo/koapp），默认端口 :13334
│   │                 # openapi-specs/ + openapi-spec.ts → GET /openapi.json
│   └── admin/        # React 19 + Vite + shadcn 管理控制台（含 API Docs 页）
├── packages/
│   └── commands/     # CLI 命令（app、apikey）
├── bin/sql2api.js    # CLI 入口
├── scripts/          # 模型下载 + 数据库初始化 SQL
└── docker-compose.yml
```

```mermaid
flowchart LR
  Client[客户端 / curl]
  Admin[Admin Console]
  CLI[CLI]
  API[services :13334]
  Meta[(SQLite 元数据)]
  DB[(MySQL / PG / Oracle / SQL Server)]
  LLM[本地 GGUF LLM]

  Client -->|"Bearer Api-Key /openapi/*"| API
  Admin -->|"Session Cookie /api/*"| API
  CLI --> Meta
  API --> Meta
  API --> DB
  API -.->|可选| LLM
```

| 组件 | 职责 | 技术栈 |
|------|------|--------|
| `apps/services` | API 服务、元数据存储、调用引擎 | `@axiosleo/koapp`、`mysql2`、`pg`、`better-sqlite3`、`node-llama-cpp` |
| `apps/admin` | Web 管理界面 | React 19、Vite、TanStack Router/Query、shadcn/ui、CodeMirror SQL 编辑器 |
| `packages/commands` | 命令行工具 | `@axiosleo/cli-tool` |

**说明：** 业务数据源支持 MySQL / PostgreSQL 协议兼容库、Oracle（`oracledb` thin）、SQL Server（`mssql`），各自独立 Type。SQLite（默认 `./data/sql2api.db`）是内部元数据存储，用于应用、密钥、连接、模型、SQL 与日志。

## 环境要求

- **Node.js** `>= 20`（`.nvmrc` 推荐 `24.8.0`）
- **pnpm** `>= 9`（`packageManager`：`pnpm@11.10.0`）
- **Docker**（可选）— 本地 MySQL 8 + PostgreSQL 16 测试库
- **Bun**（可选）— 将 services 编译为单文件二进制

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. （可选）启动测试数据库

```bash
cp .env.example .env   # 可选；本地默认值已可用
docker compose up -d
```

| 数据库 | 主机端口 | 用户 / 密码 | 库名 |
|--------|----------|-------------|------|
| MySQL 8 | `33306` | `root` / `sql2api_dev_pass` | `main_db` |
| PostgreSQL | `5432` | `sql2api` / `sql2api_dev_pass` | `sql2api` |

首次启动时，`scripts/db-init/` 下的种子 SQL 会创建示例 `users` / `orders` 表。

### 3. 配置 services

创建 `apps/services/.env`（也可参考根目录 `.env.example` 中的注释）：

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me   # 必须非空，否则无法登录管理后台
# APP_SECRET=sql2api-dev-secret-change-me
# SQLITE_PATH=./data/sql2api.db
# LLAMA_MODEL_PATH=          # 留空则禁用本地 AI
# AI_PROVIDER=local          # 或 ollama
# OLLAMA_BASE_URL=http://127.0.0.1:11434
# OLLAMA_MODEL=gpt-oss:20b
# OLLAMA_TIMEOUT_MS=120000
# OLLAMA_API_KEY=              # 可选；反代鉴权用的 Bearer Token
```

管理台 **System Settings** 可在运行时覆盖上述配置（存入 SQLite）。

### 4. 启动

```bash
# API 服务 → http://127.0.0.1:13334
pnpm --filter sql2spi-services run dev

# 管理控制台 → http://127.0.0.1:5173（将 /api 代理到 :13334）
pnpm --filter sql2api-admin run dev
```

打开 Admin Console，使用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 登录，然后创建应用、连接与 SQL API。

> services 包名为 `sql2spi-services`（历史拼写）。使用 `pnpm --filter` 时请使用该名称。

## 配置项

`apps/services` 使用的环境变量（见 `src/config.ts`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DEPLOY_ENV` | `local` | 设为 `prod` 时启用多 worker 集群 |
| `API_PORT` | `13334` | HTTP 监听端口 |
| `APP_SECRET` | `sql2api-dev-secret-change-me` | Session 签名与密码加密密钥 — **生产环境务必修改** |
| `ADMIN_USERNAME` | `admin` | 管理后台用户名 |
| `ADMIN_PASSWORD` | _(空)_ | 管理后台密码；**为空则禁用登录** |
| `SQLITE_PATH` | `./data/sql2api.db` | 元数据存储路径 |
| `INVOKE_LOG_RETENTION_DAYS` | `30` | 调用日志保留天数 |
| `AI_PROVIDER` | `local` | AI 后端：`local`（GGUF）或 `ollama` |
| `LLAMA_MODEL_PATH` | _(空)_ | `local` 提供者使用的 GGUF 路径；为空则禁用本地 AI |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama HTTP 基址（`AI_PROVIDER=ollama` 时） |
| `OLLAMA_MODEL` | `gpt-oss:20b` | Ollama 模型名 |
| `OLLAMA_TIMEOUT_MS` | `120000` | Ollama 请求超时（毫秒） |
| `OLLAMA_API_KEY` | _(空)_ | 可选；反代鉴权用的 Bearer Token；为空则不发送鉴权头 |

在线覆盖：管理台 **System Settings** 将 provider / Ollama 选项存入 SQLite，优先级高于环境变量（Reset 可清除在线配置）。

Admin Vite 环境变量（`apps/admin/.env.example`）：

| 变量 | 说明 |
|------|------|
| `VITE_API_BASE_URL` | 可选 API 基址（为空则走同源 / Vite 代理） |

## 使用流程

1. **创建应用**（Admin Console 或 CLI）
2. **创建 Api-Key**（`sk2a_…`）— 请妥善保存，明文仅展示一次
3. **添加连接** — 对接 MySQL 或 PostgreSQL
4. **（可选）同步模型** — 拉取表/字段元数据
5. **注册 SQL** — 使用命名参数（如 `:id`、`:name`）
6. **调用** — 请求 `/openapi/invoke/{uuid}`，并携带 `Authorization: Bearer <api-key>`

### 示例：调用 SELECT 类 SQL

```bash
curl -sS \
  -H "Authorization: Bearer sk2a_YOUR_TOKEN_HERE" \
  "http://127.0.0.1:13334/openapi/invoke/<sql-uuid>?id=1"
```

### 示例：调用 INSERT 类 SQL

```bash
curl -sS -X POST \
  -H "Authorization: Bearer sk2a_YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}' \
  "http://127.0.0.1:13334/openapi/invoke/<sql-uuid>"
```

## API 概览

两套接口共享同一套业务路由：

| 接口面 | 鉴权 | 基路径 | 面向 |
|--------|------|--------|------|
| 公开 OpenAPI | Bearer Api-Key | `/openapi/*` | 应用 / 集成方 |
| Admin API | Session Cookie（先 `/api/login`） | `/api/*` | Admin Console |

主要公开路由：

| 领域 | 路径 |
|------|------|
| 连接 | `POST/GET /openapi/connections`、`GET/PATCH/DELETE /openapi/connections/{id}`、`POST …/test` |
| 模型 | `GET …/connections/{id}/tables`、`POST …/models/generate`、`GET/DELETE /openapi/models/{id}`、`POST …/sync` |
| SQL | `POST/GET /openapi/sqls`、`POST /generate`、`POST /review`、`GET/PATCH/DELETE /openapi/sqls/{id}`、`GET /openapi/sqls/{id}/openapi` |
| 调用 | `ANY /openapi/invoke/{uuid}` |
| OpenAPI 文档 | `GET /openapi.json`（Api-Key；裸 JSON，供 ApiFox 定时导入） |
| 健康检查 | `GET /api/health`（无需鉴权） |

完整 OpenAPI 规范（按模块手写的片段）：

- 对外 Api-Key 面（会合并进 `/openapi.json`）：
  - [`openapi.connection.json`](./apps/services/src/services/openapi-specs/openapi.connection.json)
  - [`openapi.model.json`](./apps/services/src/services/openapi-specs/openapi.model.json)
  - [`openapi.sql.json`](./apps/services/src/services/openapi-specs/openapi.sql.json)
  - [`openapi.invoke.json`](./apps/services/src/services/openapi-specs/openapi.invoke.json)
- 控制台参考（Session `/api/*`，**不参与合并**；`/api` 不支持 Api-Key）：
  - [`openapi.admin.json`](./apps/services/src/services/openapi-specs/openapi.admin.json)
  - [`openapi.stats.json`](./apps/services/src/services/openapi-specs/openapi.stats.json)

### 合并后的 OpenAPI 单文件

`GET /openapi.json` 返回一份面向 **Api-Key 对外接口** 的 OpenAPI 3.0 JSON：上述四个 `/openapi/*` 模块规范，加上每条 **enabled** 已注册 SQL 的 invoke 接口（参数由该 SQL 的 `params` 规则生成）。控制台 `/api/*`（登录、应用、统计等）使用 Session Cookie，**不接受 Api-Key**，也 **不会** 进入该合并文档。

直链鉴权方式：

```bash
# 查询参数（方便 ApiFox 定时导入）
curl 'http://127.0.0.1:13334/openapi.json?api_key=sk2a_...'

# 或 Bearer 头
curl -H 'Authorization: Bearer sk2a_...' http://127.0.0.1:13334/openapi.json
```

动态 SQL 接口按 Api-Key 所属应用过滤。管理台另提供 `GET /api/openapi.json`（Session；内容同为对外面）以及 **API Docs** 页面（头像菜单 → API Docs）用于浏览、下载与复制直链。单条 SQL 文档：行菜单 **Copy API Doc**，或 `GET /api/sqls/{id}/openapi`。

## AI 功能（可选）

下载 Qwen2.5-Coder GGUF 模型并写入 `LLAMA_MODEL_PATH`：

```bash
# 预设：qwen2.5-coder-1.5b | qwen2.5-coder-3b（默认） | qwen2.5-coder-7b
bash scripts/download-model.sh qwen2.5-coder-3b --set-env
```

然后重启 services。SQL 生成（`POST …/sqls/generate`）与审查（`POST …/sqls/review`）即可使用。

## CLI

CLI 依赖已编译的 services（从 `apps/services/dist` 加载 SQLite 辅助模块），请先构建：

```bash
pnpm --filter sql2spi-services run build
```

```bash
# 应用管理
node bin/sql2api.js app create --name my-app [--desc "..."]
node bin/sql2api.js app list
node bin/sql2api.js app remove --name my-app --yes

# Api-Key（创建时仅展示一次 token）
node bin/sql2api.js apikey create --app <app_id> [--name default]
node bin/sql2api.js apikey list --app <app_id>
node bin/sql2api.js apikey revoke --id <key_id>
```

若已通过 `pnpm link` / 安装全局链接，也可直接使用 `sql2api …`。

## 构建与部署

### 标准 Node 构建

```bash
pnpm build
# 或按包构建：
pnpm --filter sql2spi-services run build   # → apps/services/dist
pnpm --filter sql2api-admin run build      # → apps/admin/dist

# 生产启动（services）
pnpm --filter sql2spi-services run start
```

### Bun 单文件二进制（可选）

`better-sqlite3` 与 `node-llama-cpp` 被 external 化，目标机器上仍需可用（或在 Bun 运行时使用内置 `bun:sqlite`）。

`validatorjs` 语言包通过动态 `require()` 加载，Bun 单文件编译无法嵌入；启动时由 `src/polyfills/validatorjs-lang.ts` 静态注册英文消息。请保留该 polyfill，不要依赖 externalize `validatorjs`。

```bash
# macOS（arm64）
cd apps/services
bun build ./src/bootstrap.ts --compile \
  --external better-sqlite3 \
  --external node-llama-cpp \
  --outfile ./build/sql2api-services-darwin

# Linux x64
bun build ./src/bootstrap.ts --compile --target=bun-linux-x64 \
  --external better-sqlite3 \
  --external node-llama-cpp \
  --outfile ./build/sql2api-services
```

## 常用脚本

| 命令 | 说明 |
|------|------|
| `pnpm install` | 安装 workspace 依赖 |
| `pnpm build` / `test` / `lint` / `clean` | 递归执行 workspace 脚本 |
| `pnpm --filter sql2spi-services run dev` | API 服务（nodemon + SWC） |
| `pnpm --filter sql2api-admin run dev` | Admin Console（Vite） |
| `docker compose up -d` | 本地 MySQL + PostgreSQL |
| `bash scripts/download-model.sh …` | 下载本地 LLM GGUF |

## 许可证

根目录尚未声明项目许可证。

Admin Console（`apps/admin`）基于 [shadcn-admin](https://github.com/satnaing/shadcn-admin)，模板的 MIT 许可证见 `apps/admin/LICENSE`。
