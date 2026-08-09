# Task Management System

A task management app inspired by Jira/Linear/Notion — Kanban board, task detail with subtasks/comments/activity, projects, custom statuses, themeable UI, and multi-user workspaces.

Built as a technical assessment for a Full Stack Developer role. Deadline: 2026-08-18.

> **🚧 Work in progress.** Live URL and screenshots will appear here as they land.

- **Live web:** _pending — will be a Vercel URL_
- **Live API:** _pending — will be a Render URL_
- **Swagger:** _pending — `<api-url>/api/docs`_

---

## Stack

| Layer        | Choice                                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend** | Next.js (App Router) · Tailwind CSS · shadcn/ui + Radix · TanStack Query · Zustand · react-hook-form + zod · next-themes · @dnd-kit · react-day-picker · react-markdown |
| **Backend**  | NestJS 11 · Prisma ORM · PostgreSQL 16 · class-validator · @nestjs/passport (JWT + Google) · @nestjs/throttler · helmet · pino · Jest                                   |
| **Shared**   | `packages/shared` — enums + zod schemas + TS types consumed by both apps                                                                                                |
| **Infra**    | Vercel (web) · Render (api) · Neon (Postgres) · Cloudinary (files) · Sentry (errors) · GitHub Actions (CI)                                                              |
| **Monorepo** | pnpm workspaces — `apps/web`, `apps/api`, `packages/shared`                                                                                                             |

---

## Repo layout

```
Task_Management_system/
├── apps/
│   ├── api/            # NestJS backend
│   │   ├── prisma/     # schema + migrations + seed
│   │   └── src/
│   └── web/            # Next.js frontend
│       └── app/
├── packages/
│   └── shared/         # enums + zod schemas
├── docs/
│   ├── REQUIREMENTS.md # feature checklist from Figma
│   ├── erd.md          # data model + Mermaid ER diagram
│   └── architecture.md # system diagram + auth sequences
├── docker-compose.yml  # local Postgres
├── pnpm-workspace.yaml
└── README.md
```

---

## Quick start (local development)

### Prerequisites

- **Node.js 22 LTS** (`.nvmrc` pinned)
- **pnpm 10+**
- **Docker Desktop** (for local Postgres)

### Setup

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Start local Postgres (host port 5433 — see note below)
docker compose up -d

# 3. Copy env files and fill in real values where needed
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 4. Run initial Prisma migration
pnpm --filter api exec prisma migrate dev --name init

# 5. Start both apps in parallel
pnpm dev
```

Web will be on http://localhost:3000, API on http://localhost:4000, Swagger on http://localhost:4000/api/docs.

### Note on Postgres port (Windows)

The Docker container exposes Postgres on host port **5433** (not the default 5432) to avoid conflicts with native Windows Postgres installations. If you don't have a native Postgres, this makes no difference. If you'd rather use 5432, edit `docker-compose.yml` and `apps/api/.env` accordingly.

### Useful commands

```bash
pnpm --filter api exec prisma studio         # Browse DB in a web UI (http://localhost:5555)
pnpm --filter api exec prisma migrate dev    # Create a new migration
pnpm --filter api test                       # Run backend unit tests
pnpm typecheck                               # Typecheck all packages
pnpm lint                                    # Lint all packages
```

---

## Environment variables

See `apps/api/.env.example` and `apps/web/.env.example` for the full list with descriptions. Highlights:

**`apps/api`:** `DATABASE_URL`, `JWT_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `FRONTEND_URL`, `CLOUDINARY_*`, `SENTRY_DSN`, `THROTTLE_*`

**`apps/web`:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`

---

## Docs

- **[ER diagram](./docs/erd.md)** — data model with Mermaid diagram and design notes.
- **[Architecture](./docs/architecture.md)** — system diagram, auth sequence diagrams, file upload flow.
- **[Deployment guide](./docs/DEPLOY.md)** — step-by-step signup + provisioning for Neon, Cloudinary, Sentry, Render, Vercel, Google Cloud.

---

## Assessment context

Built from the Figma design at:
https://www.figma.com/design/obONCFmoTFN27V5H9PHS2X/Assessment-Task

### Deliberate deviations from the Figma

- **Teams field** on Task Detail: rendered as disabled. Modelling teams properly (Team + TeamMember + TaskTeam + management UI) was out of scope for the 13-day timeline.
- **Live presence avatars** (floating "D"/"A" badges on the board): rendered as static seeded members. No WebSockets in v1.
- **Design copy on login screen** says "Enter your email below" but there's no email input — we follow the UI, not the copy.
- **Project detail page** in Figma jumps straight to the task list; we added a compact project header (name, priority, lead, due, edit) since otherwise projects have no post-creation edit UI.

More detail in [`docs/REQUIREMENTS.md`](./docs/REQUIREMENTS.md#deliberate-deviations-from-figma-document-in-readme).

---

## Development workflow

- **Branches:** `main` = deployed. Feature branches `feat/<area>-<what>`, fixes `fix/<area>-<what>`, chores `chore/<what>`.
- **Commits:** Conventional Commits (`feat(scope): summary` + body). Small and focused.
- **PRs:** feature-wise. Normal merge (preserves feature-branch commits on main).
- **Pre-commit:** husky + lint-staged runs prettier on staged files.
- **CI:** GitHub Actions runs lint + typecheck + backend tests on every PR.

---

## License

Private — for assessment evaluation only.
