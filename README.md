# LeakGuard

Web system for detecting leaked tokens, passwords, and configuration files in public Git repositories of student and team projects.

> 🚧 **Work in progress.** The project skeleton is in place; detection and GitHub integration are being built.

## Tech stack

| Layer         | Technology                                         |
| ------------- | -------------------------------------------------- |
| Language      | TypeScript (strict) everywhere                     |
| Backend       | NestJS (HTTP API + background worker), TypeORM     |
| Database      | PostgreSQL                                         |
| Queue         | BullMQ + Redis                                     |
| Frontend      | React, Vite, Tailwind CSS, TanStack Query, i18next |
| Tests         | Vitest, React Testing Library                      |
| Lint / format | oxlint (type-aware), Prettier                      |

## Repository layout

```
leakguard/
├─ client/              # React + Vite + Tailwind web client
├─ server/              # NestJS: API (src/main.ts) and worker (src/worker.ts)
├─ packages/
│  ├─ detector/         # secret detection engine, pure TS (runs in Node and in the browser)
│  └─ shared/           # types and API contracts shared by client and server
├─ docker-compose.yml   # local PostgreSQL and Redis
└─ .env.example         # all environment variables, with placeholder values
```

## Prerequisites

- **Node.js 24** or newer (see `.nvmrc`) and npm 11
- **Docker** with Docker Compose (for local PostgreSQL and Redis)

## Getting started

```bash
# 1. Install dependencies for all workspaces
npm install

# 2. Create your local environment file and adjust the passwords
cp .env.example .env

# 3. Start PostgreSQL and Redis (bound to localhost only)
docker compose up -d

# 4. Start the API, the worker and the client in watch mode
npm run dev
```

Then open <http://localhost:5173>. The home page shows the API status: the client calls
`GET /api/v1/health` through the Vite dev-server proxy, and the API checks PostgreSQL and Redis.

| Service | URL                                 |
| ------- | ----------------------------------- |
| Client  | http://localhost:5173               |
| API     | http://localhost:3000/api/v1        |
| Health  | http://localhost:3000/api/v1/health |

## Commands

All commands run from the repository root.

| Command                | What it does                                              |
| ---------------------- | --------------------------------------------------------- |
| `npm install`          | Install dependencies for every workspace                  |
| `npm run dev`          | Run shared packages, API, worker and client in watch mode |
| `npm run build`        | Build every workspace for production                      |
| `npm run lint`         | Lint the whole repository with oxlint (type-aware)        |
| `npm run typecheck`    | Type-check every workspace                                |
| `npm test`             | Run all unit tests                                        |
| `npm run format`       | Format the code with Prettier                             |
| `npm run format:check` | Check formatting without changing files                   |

### Running the production build

```bash
npm run build
npm run start -w @leakguard/server          # HTTP API
npm run start:worker -w @leakguard/server   # background worker
# client/dist contains static files to be served by any web server or CDN
```

### Database migrations

The schema is changed only through migrations (`synchronize` is always off).

```bash
npm run migration:generate -w @leakguard/server -- src/database/migrations/<Name>
npm run migration:run -w @leakguard/server
npm run migration:revert -w @leakguard/server
```

## Environment variables

See [`.env.example`](.env.example) for the full list. The server validates its environment at
startup and refuses to start if a variable is missing or malformed. Real secrets are never
committed: only `.env.example` with placeholder values is tracked.

## License

[MIT](LICENSE)
