# sql2api

**English** | [简体中文](./README.zh-CN.md)

Turn registered SQL statements into authenticated HTTP APIs over MySQL and PostgreSQL.

Create an application, add a database connection, register SQL with named parameters, and invoke it via `/openapi/invoke/{uuid}` — with an optional Admin Console and local LLM for SQL generation/review.

## Features

- **SQL → HTTP API** — Register SQL once, invoke it with Bearer Api-Key auth. Method mapping: `SELECT` → `GET`, `INSERT` → `POST`, `UPDATE` → `PATCH`, multi-statement / `CALL` → `complex` (`POST`). `DROP` / `DELETE` / `TRUNCATE` are blocked by static audit
- **App & Api-Key management** — Multi-tenant apps with `sk2a_…` keys (plaintext shown only once on create)
- **Connections** — MySQL and PostgreSQL datasources; passwords stored with AES-256-GCM
- **Models** — Sync table/column metadata for AI context and documentation
- **AI-assisted SQL** (optional) — Local GGUF models via `node-llama-cpp` for generate and review (syntax, performance, and safety)
- **Invocation logs** — Request history with configurable retention purge
- **Admin Console** — React dashboard for apps, connections, models, SQL APIs, and logs
- **CLI** — `sql2api app` / `sql2api apikey` for scripting and ops

## Architecture

```
sql2api/
├── apps/
│   ├── services/     # HTTP API backend (@axiosleo/koapp), default :13334
│   │                 # openapi-specs/ + openapi-spec.ts → GET /openapi.json
│   └── admin/        # React 19 + Vite + shadcn Admin Console (API Docs page)
├── packages/
│   └── commands/     # CLI commands (app, apikey)
├── bin/sql2api.js    # CLI entry
├── scripts/          # Model download + DB seed SQL
└── docker-compose.yml
```

```mermaid
flowchart LR
  Client[Client / curl]
  Admin[Admin Console]
  CLI[CLI]
  API[services :13334]
  Meta[(SQLite meta store)]
  DB[(MySQL / PostgreSQL)]
  LLM[Local GGUF LLM]

  Client -->|"Bearer Api-Key /openapi/*"| API
  Admin -->|"Session cookie /api/*"| API
  CLI --> Meta
  API --> Meta
  API --> DB
  API -.->|optional| LLM
```

| Component | Role | Stack |
|-----------|------|--------|
| `apps/services` | API server, meta store, invoke engine | `@axiosleo/koapp`, `mysql2`, `pg`, `better-sqlite3`, `node-llama-cpp` |
| `apps/admin` | Web admin UI | React 19, Vite, TanStack Router/Query, shadcn/ui, CodeMirror SQL editor |
| `packages/commands` | CLI | `@axiosleo/cli-tool` |

**Note:** Customer datasources are MySQL/PostgreSQL only. SQLite (`./data/sql2api.db` by default) is the internal meta store for apps, keys, connections, models, SQLs, and logs.

## Requirements

- **Node.js** `>= 20` (`.nvmrc` recommends `24.8.0`)
- **pnpm** `>= 9` (`packageManager`: `pnpm@11.10.0`)
- **Docker** (optional) — local MySQL 8 + PostgreSQL 16 for testing
- **Bun** (optional) — compile services into a single binary

## Quick Start

### 1. Install

```bash
pnpm install
```

### 2. (Optional) Start test databases

```bash
cp .env.example .env   # optional; defaults work for local
docker compose up -d
```

| Database   | Host port | User / Password                         | Database  |
|------------|-----------|-----------------------------------------|-----------|
| MySQL 8    | `33306`   | `root` / `sql2api_dev_pass`             | `main_db` |
| PostgreSQL | `5432`    | `eagle` / `eagle_dev_pass`              | `eagle`   |

Seed SQL under `scripts/db-init/` creates sample `users` / `orders` tables on first start.

### 3. Configure services

Create `apps/services/.env` (or copy from root `.env.example` comments):

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me   # must be non-empty to enable admin login
# APP_SECRET=sql2api-dev-secret-change-me
# SQLITE_PATH=./data/sql2api.db
# LLAMA_MODEL_PATH=          # leave empty to disable AI
```

### 4. Run

```bash
# API server → http://127.0.0.1:13334
pnpm --filter sql2spi-services run dev

# Admin Console → http://127.0.0.1:5173 (proxies /api → :13334)
pnpm --filter sql2api-admin run dev
```

Open the Admin Console, sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`, then create an App, Connection, and SQL API.

> The services package name is `sql2spi-services` (historical typo). Use that name with `pnpm --filter`.

## Configuration

Environment variables used by `apps/services` (`src/config.ts`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DEPLOY_ENV` | `local` | Set to `prod` to enable multi-worker cluster |
| `API_PORT` | `13334` | HTTP listen port |
| `APP_SECRET` | `sql2api-dev-secret-change-me` | Session signing + password encryption key — **change in production** |
| `ADMIN_USERNAME` | `admin` | Admin Console username |
| `ADMIN_PASSWORD` | _(empty)_ | Admin password; **empty disables login** |
| `SQLITE_PATH` | `./data/sql2api.db` | Meta store path |
| `INVOKE_LOG_RETENTION_DAYS` | `30` | Days to keep invoke logs before purge |
| `LLAMA_MODEL_PATH` | _(empty)_ | Path to GGUF model; empty disables AI features |

Admin Vite env (`apps/admin/.env.example`):

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Optional API base URL (empty = same-origin / Vite proxy) |

## Usage Workflow

1. **Create an App** (Admin Console or CLI)
2. **Create an Api-Key** (`sk2a_…`) — store the token securely; it is shown only once
3. **Add a Connection** to MySQL or PostgreSQL
4. **(Optional) Sync Models** — pull table/column metadata
5. **Register SQL** with named params (e.g. `:id`, `:name`)
6. **Invoke** via `/openapi/invoke/{uuid}` with `Authorization: Bearer <api-key>`

### Example: invoke a SELECT SQL

```bash
curl -sS \
  -H "Authorization: Bearer sk2a_YOUR_TOKEN_HERE" \
  "http://127.0.0.1:13334/openapi/invoke/<sql-uuid>?id=1"
```

### Example: invoke an INSERT SQL

```bash
curl -sS -X POST \
  -H "Authorization: Bearer sk2a_YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}' \
  "http://127.0.0.1:13334/openapi/invoke/<sql-uuid>"
```

## API Overview

Two surfaces share the same business routers:

| Surface | Auth | Base path | Audience |
|---------|------|-----------|----------|
| Public OpenAPI | Bearer Api-Key | `/openapi/*` | Applications / integrations |
| Admin API | Session cookie (after `/api/login`) | `/api/*` | Admin Console |

Key public routes:

| Area | Paths |
|------|-------|
| Connections | `POST/GET /openapi/connections`, `GET/PATCH/DELETE /openapi/connections/{id}`, `POST …/test` |
| Models | `GET …/connections/{id}/tables`, `POST …/models/generate`, `GET/DELETE /openapi/models/{id}`, `POST …/sync` |
| Sqls | `POST/GET /openapi/sqls`, `POST /generate`, `POST /review`, `GET/PATCH/DELETE /openapi/sqls/{id}`, `GET /openapi/sqls/{id}/openapi` |
| Invoke | `ANY /openapi/invoke/{uuid}` |
| OpenAPI document | `GET /openapi.json` (Api-Key; raw JSON for ApiFox timed import) |
| Health | `GET /api/health` (no auth) |

Full OpenAPI specs (hand-written module fragments):

- Public surface (merged into `/openapi.json`):
  - [`openapi.connection.json`](./apps/services/src/services/openapi-specs/openapi.connection.json)
  - [`openapi.model.json`](./apps/services/src/services/openapi-specs/openapi.model.json)
  - [`openapi.sql.json`](./apps/services/src/services/openapi-specs/openapi.sql.json)
  - [`openapi.invoke.json`](./apps/services/src/services/openapi-specs/openapi.invoke.json)
- Console-only reference (Session `/api/*`, **not** merged; Api-Key cannot access `/api`):
  - [`openapi.admin.json`](./apps/services/src/services/openapi-specs/openapi.admin.json)
  - [`openapi.stats.json`](./apps/services/src/services/openapi-specs/openapi.stats.json)

### Merged OpenAPI document

`GET /openapi.json` returns a single OpenAPI 3.0 JSON for the **public Api-Key surface**: the four `/openapi/*` module specs above plus every **enabled** registered SQL invoke endpoint (parameters derived from each SQL’s `params` rules). Console `/api/*` routes (admin login, apps, stats, etc.) use Session cookies, do **not** accept Api-Key, and are **excluded** from this document.

Auth for the direct link:

```bash
# Query parameter (convenient for ApiFox timed import)
curl 'http://127.0.0.1:13334/openapi.json?api_key=sk2a_...'

# Or Bearer header
curl -H 'Authorization: Bearer sk2a_...' http://127.0.0.1:13334/openapi.json
```

Dynamic SQL paths are scoped to the Api-Key’s app. Admin Console also exposes `GET /api/openapi.json` (session; same public-only content) and an **API Docs** page (avatar menu → API Docs) for browsing, downloading, and copying the direct link. Per-SQL docs: row menu **Copy API Doc** or `GET /api/sqls/{id}/openapi`.

## AI Features (Optional)

Download a Qwen2.5-Coder GGUF model and wire `LLAMA_MODEL_PATH`:

```bash
# Presets: qwen2.5-coder-1.5b | qwen2.5-coder-3b (default) | qwen2.5-coder-7b
bash scripts/download-model.sh qwen2.5-coder-3b --set-env
```

Then restart the services process. SQL generate (`POST …/sqls/generate`) and review (`POST …/sqls/review`) become available.

## CLI

Build services first (CLI loads compiled SQLite helpers from `apps/services/dist`):

```bash
pnpm --filter sql2spi-services run build
```

```bash
# Applications
node bin/sql2api.js app create --name my-app [--desc "..."]
node bin/sql2api.js app list
node bin/sql2api.js app remove --name my-app --yes

# Api-Keys (token shown once on create)
node bin/sql2api.js apikey create --app <app_id> [--name default]
node bin/sql2api.js apikey list --app <app_id>
node bin/sql2api.js apikey revoke --id <key_id>
```

If the package is linked globally via `pnpm link` / install, you can also run `sql2api …` directly.

## Build & Deploy

### Standard Node build

```bash
pnpm build
# or per package:
pnpm --filter sql2spi-services run build   # → apps/services/dist
pnpm --filter sql2api-admin run build      # → apps/admin/dist

# production start (services)
pnpm --filter sql2spi-services run start
```

### Bun single-binary (optional)

`better-sqlite3` and `node-llama-cpp` are externalized and still need to be available on the target host (or use Bun’s built-in `bun:sqlite` when running under Bun).

```bash
# macOS (arm64)
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

## Scripts Reference

| Command | Description |
|---------|-------------|
| `pnpm install` | Install workspace dependencies |
| `pnpm build` / `test` / `lint` / `clean` | Recursive workspace scripts |
| `pnpm --filter sql2spi-services run dev` | API server (nodemon + SWC) |
| `pnpm --filter sql2api-admin run dev` | Admin Console (Vite) |
| `docker compose up -d` | Local MySQL + PostgreSQL |
| `bash scripts/download-model.sh …` | Download local LLM GGUF |

## License

No root project license is declared yet.

The Admin Console (`apps/admin`) is based on [shadcn-admin](https://github.com/satnaing/shadcn-admin) and includes that template’s MIT license under `apps/admin/LICENSE`.
