# Task Management System

A Jira/Linear-inspired task management app: Kanban board with drag-and-drop, task detail with threaded comments and activity feed, projects, subtasks, custom per-workspace statuses, file uploads via Cloudinary, multi-workspace switching, a four-role access model, themeable UI, and full mobile responsiveness.

Built as a technical assessment for a Full Stack Developer role.

- **Live web:** https://pyramid-web-sigma.vercel.app/
- **Live API:** https://pyramid-sb7m.onrender.com/health
- **Swagger:** https://pyramid-sb7m.onrender.com/api/docs

> **Heads-up:** the API runs on Render's free tier, which sleeps a service after ~15 minutes of no traffic. A GitHub Actions cron ([`.github/workflows/keep-warm.yml`](./.github/workflows/keep-warm.yml)) pings `/health` every 10 minutes to prevent that, so most visits are instant. If the very first request still feels slow, GitHub cron ran late — wait a beat and try again.

---

## Try it in 60 seconds

1. Open the live web URL.
2. Click **Continue as Guest** — a fresh workspace is provisioned with 4 default statuses, 4 seeded teammates, 1 demo project, and 6 demo tasks.
3. Drag a card between columns. Click one to open its detail modal. Try inline-edit on the title. Add a subtask.
4. **Rich text comments** — in the composer, use the toolbar (bold/lists/code/etc), type `@` for a member picker, or **paste a screenshot** to upload it inline (click it to resize).
5. Click the workspace name (sidebar, top left) → **+ Create workspace** → "Marketing 2026" → lands in a clean workspace with no fixtures.
6. Switch back to your original workspace via the same dropdown.
7. **Settings** (from the same dropdown) → try Profile edit, Workspace Members, Statuses management, Leave workspace.

---

## What ships

### Auth

- **Guest login** — one-click, creates a real user (`isGuest=true`) + workspace + seed data.
- **Google OAuth** — Passport strategy; new users get a fresh workspace, returning users land in their existing one.
- **JWT access token** (15m) + **opaque refresh token** (30d, SHA-256 hashed row, rotated on every refresh with revocation). Silent refresh via Axios interceptor.
- **Nightly guest cleanup cron** — deletes `isGuest && createdAt < NOW()-30d`; workspaces cascade.

### Board & tasks

- **Kanban board** with @dnd-kit: drag between columns (status change), within column (fractional-index reorder), and column-header drag (status reorder).
- **Inline quick-add** per column; Fields dropdown to toggle card meta (Priority / Members / Due Date / Labels / Reporter); overdue red badge; static seeded presence avatars.
- **List view** grouped by status with collapsible sections and per-user column visibility.
- **Server-side search + filters** — `q`, `statusIds`, `priority`, `labelIds`, `assigneeIds`, `dueBefore`. 300ms debounced input.

### Task detail

- Inline-edit title, description (react-markdown render), priority, dates, assignee, labels. **Inline "+ New label"** popover creates and auto-assigns in one gesture.
- **Threaded comments** with a TipTap-based **rich text editor** — bold / italic / strike / inline code / headings / bullet + ordered lists / blockquote / code block via a toolbar; keyboard shortcuts too (Cmd+B, `- ` prefix for lists, ``` for code block, etc). One level of reply. Bodies stored as ProseMirror JSON (`Comment.body: Json`).
- **@mention typeahead** — type `@` → filtered dropdown of workspace members → pick → inserts a `type: 'mention'` node with the userId baked in. Backend delivers notifications by userId (no regex fuzzy match); also keeps a regex fallback for manually-typed `@username`.
- **Notification bell** in the top bar — 30s polling for unread count, popover with recent MENTION notifications, click a row to jump to the mentioned task.
- **Image paste + drop + upload** in comments — screenshots or dragged files upload direct to Cloudinary (`type=upload`, public URL), insert as image nodes with a **resize toolbar** (25/50/75/100% width presets).
- **Activity feed** — server-side transactional writes for create / status / priority / date / member / label / comment / resource events.
- **Resources** — paste-a-link (LINK type) and file upload (FILE type) via signed Cloudinary uploads (`type=authenticated`) with 5-min signed read URLs. Distinct from inline comment images (public) — sensitive files use this path.
- **Subtasks** — one level deep via `parentTaskId`.
- **Details panel** on the right — status, priority, members, dates, labels, reporter; all inline-editable with optimistic updates.
- **Modal + full-page routes** — parallel/intercepted routes: card click opens as modal over the board; direct URL entry lands on the full-page view; an expand icon jumps between the two (opens in a new tab so board context stays).

### Projects

- List view with filters + Fields toggle + `+ Add Project` modal.
- Detail view with compact editable project header (name, priority, lead, due date) plus the same Board/List views scoped to the project.

### Members & access (the interesting part)

- **Four-role model** with two invite gestures — see [Access model](#access-model) below.
- **Workspace Members panel** (Settings) — add by email with role picker (MEMBER or ADMIN), list with role chips, remove.
- **Project Members panel** (Project detail) — add by email; auto-provisions a COLLABORATOR workspace row if the invitee has no workspace membership yet.
- Every read + write path scopes through a shared `ProjectAccessService` — no IDOR, verified by unit tests.

### Multi-workspace

- **Sidebar switcher** — dropdown lists every workspace the user belongs to with an active check + role hint on the rest.
- **+ Create workspace** modal — provisions a clean workspace (default statuses only, no demo seed).
- **AuthGuard** validates URL slugs against real memberships and swaps the store to match, or bounces to the primary workspace for unknown slugs.

### Settings

- **Profile** edit (name / username / title / avatar URL) with toggle-based edit mode.
- **Workspace Members** panel (see above).
- **Custom statuses** — add / rename / recolor / reorder / delete with move-to. Sole-status delete blocked with 409.
- **Leave workspace** — destructive-styled section; sole-owner blocked with inline reason.
- **Delete workspace** — OWNER-only, requires typing the workspace name to confirm; cascades via Prisma `onDelete: Cascade`.
- **Theme (light/dark/system)** and **accent color (6 presets)** via the sidebar user menu; both persist to localStorage and sync to `UserPreference` server-side.

### Auth extras

- **Guest → Google upgrade** — signed-in guests can attach a Google account in place from the workspace user menu (same user id, same workspace, same tasks). Merge intent flows through OAuth via a signed JWT `state` param — no server-side state store. Blocked if the target Google account already belongs to another user.

### Infra & observability

- **Vercel** (web) + **Render** (api) + **Neon** (Postgres) + **Cloudinary** (files) + **Sentry** (error monitoring).
- **Pino** structured JSON logs with a request-id middleware; the id is echoed in Sentry event tags so a Sentry trace links back to a specific log line.
- **CI** — GitHub Actions runs lint + typecheck + Jest on every PR.

---

## Stack

| Layer        | Choice                                                                                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend** | Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS 4 · shadcn/ui + Base UI · TanStack Query · Zustand · next-themes · @dnd-kit · react-day-picker · TipTap 3 (StarterKit + Link + Mention + Image + Placeholder) |
| **Backend**  | NestJS 11 · Prisma 5 · PostgreSQL 16 · class-validator · @nestjs/passport (JWT + Google) · @nestjs/throttler · helmet · pino · Jest                                                                                        |
| **Shared**   | `packages/shared` — enums + zod schemas + TS types                                                                                                                                                                         |
| **Infra**    | Vercel · Render · Neon · Cloudinary · Sentry · GitHub Actions                                                                                                                                                              |
| **Monorepo** | pnpm workspaces — `apps/web`, `apps/api`, `packages/shared`                                                                                                                                                                |

---

## Access model

Two invite gestures, four workspace roles.

| Role             | How to become one                              | Sees                                                               | Can edit                         |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------------------ | -------------------------------- |
| **OWNER**        | Create the workspace (guest / Google / manual) | Everything                                                         | Everything, plus rename          |
| **ADMIN**        | Workspace invite as ADMIN                      | Everything                                                         | Everything except rename         |
| **MEMBER**       | Workspace invite as MEMBER                     | Every project + task                                               | Everything except manage members |
| **COLLABORATOR** | Project invite (auto-creates workspace row)    | Only projects they hold a `ProjectMember` row for; no orphan tasks | Tasks under their projects only  |

The `COLLABORATOR` tier is the "external contractor" case — added implicitly when you project-invite someone who isn't in the workspace yet. Never downgraded from a MEMBER/ADMIN. Every read + write scopes through `ProjectAccessService` and returns **404 on denial** (not 403) so we don't leak existence of projects the caller can't see.

Three-account walkthrough: sign in as Priya (OWNER), Sam (invited as MEMBER, sees every project), and Alex (project-invited to Site Redesign only, sees just that project — probing another project's URL returns 404, not 403).

---

## Repo layout

```
Task_Management_system/
├── apps/
│   ├── api/            # NestJS backend
│   │   ├── prisma/     # schema + migrations + seed
│   │   └── src/
│   │       ├── modules/{auth,workspaces,projects,tasks,statuses,labels,comments,activity,resources,preferences}/
│   │       ├── common/{guards,interceptors,middleware,pipes}/
│   │       └── main.ts
│   └── web/            # Next.js frontend
│       ├── app/{login,settings,w/[slug]/…}/
│       ├── components/{workspace,board,task-detail,projects,settings,ui}/
│       └── lib/{api,hooks,stores}/
├── packages/
│   └── shared/         # enums + zod schemas
├── docs/
│   ├── REQUIREMENTS.md # SRS-style: functional + non-functional requirements
│   ├── architecture.md # system diagram + auth sequences + file upload flow
│   ├── erd.md          # data model with Mermaid ER diagram
│   └── postman/task-mgmt.postman_collection.json
├── docker-compose.yml  # local Postgres (host port 5433)
└── pnpm-workspace.yaml
```

---

## Quick start (local development)

### Prerequisites

- **Node.js 22 LTS** (`.nvmrc` pinned)
- **pnpm 10+**
- **Docker Desktop** (for local Postgres)

### Setup

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Start local Postgres (host port 5433 — see note)
docker compose up -d

# 3. Copy env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 4. Prisma migrate
pnpm --filter api exec prisma migrate dev --name init

# 5. Start both apps
pnpm dev
```

Web on http://localhost:3000, API on http://localhost:4000, Swagger on http://localhost:4000/api/docs.

Guest login works out of the box. Google login needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` in `apps/api/.env`; without them the `/auth/google` route 500s but the rest of the app is unaffected.

### Postgres port on Windows

The Docker container exposes Postgres on **5433** (not the default 5432) so it doesn't clash with a native Windows Postgres install. If you don't have a native Postgres, this makes no difference. To switch to 5432, edit `docker-compose.yml` and `apps/api/.env` accordingly.

### Useful commands

```bash
pnpm --filter api exec prisma studio         # Browse DB in a web UI (http://localhost:5555)
pnpm --filter api exec prisma migrate dev    # Create a new migration
pnpm --filter api test                       # Backend unit tests (Jest)
pnpm typecheck                               # Typecheck all packages
pnpm lint                                    # Lint all packages
```

### Postman

Import `docs/postman/task-mgmt.postman_collection.json`. Run top-to-bottom — earlier requests capture tokens into collection variables that later requests consume. Point `baseUrl` at `http://localhost:4000` for local or the Render URL for deployed.

---

## Environment variables

Full descriptions in `apps/api/.env.example` and `apps/web/.env.example`. Highlights:

**`apps/api`:** `DATABASE_URL`, `JWT_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `FRONTEND_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `SENTRY_DSN`.

**`apps/web`:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.

---

## Docs

- **[docs/REQUIREMENTS.md](./docs/REQUIREMENTS.md)** — SRS-style specification: introduction, user classes, functional requirements (FR-x.y grouped by feature area), non-functional requirements (security, performance, accessibility, responsiveness, observability), constraints, assumptions, out-of-scope.
- **[docs/erd.md](./docs/erd.md)** — data model with Mermaid ER diagram and per-entity notes.
- **[docs/architecture.md](./docs/architecture.md)** — system diagram, auth sequence diagrams, Cloudinary upload flow.
- **Swagger** — [`{api}/api/docs`](https://pyramid-sb7m.onrender.com/api/docs) — every endpoint auto-documented with request/response schemas.

---

## Deliberate deviations from the Figma

Called out honestly since the assessment weighs "attention to detail" and "product thinking":

- **Teams field on Task Detail** — rendered as disabled. A full Team + TeamMember + TaskTeam model with management UI wasn't a good use of the scope budget; the four-role access model was the more product-load-bearing decision.
- **Live presence avatars** on the board (floating "D"/"A" badges) — rendered as **static seeded members**. WebSocket presence adds a whole realtime layer for cosmetic value in a v1.
- **Project detail header** — Figma jumps straight to the task list; we added a compact editable header (name, priority, lead, due, edit) since otherwise projects have no post-creation edit UI.

---

## Development workflow

- **Branches:** `main` = deployed. Feature branches `feat/<area>-<what>`, fixes `fix/<area>-<what>`, chores `chore/<what>`, docs `docs/<what>`.
- **Commits:** Conventional Commits (`feat(scope): summary` + body). Small and focused — the body says _why_, the diff shows _what_.
- **PRs:** feature-wise. Normal merge (preserves feature-branch commits on main), no squash.
- **Pre-commit:** husky + lint-staged runs prettier on staged files.
- **CI:** GitHub Actions runs lint + typecheck + backend Jest on every PR.

---

## What's next (if this project continued)

Roughly in priority order:

1. **Text color picker + slash-command menu** in the rich text editor — text color needs `@tiptap/extension-color`; slash menu is a discoverability tool (users already reach every block via the toolbar, so this is polish, not a gap).
2. **Native image drag-handles** — resize is currently a preset picker (25/50/75/100%). Free-drag handles inside contenteditable are non-trivial engineering (they fight ProseMirror's selection model), but nice polish.
3. **Live presence** on the Board — WebSocket gateway on the API; replaces the seeded static avatars.
4. **Teams model** for the disabled Teams field — Team + TeamMember + TaskTeam + management UI, wired into the assignee picker as a group affordance.
5. **Project drag-to-reorder** — `Project.orderIndex` column is already in the schema.
6. **Shared types package** — currently `apps/web/lib/api/types.ts` mirrors backend DTOs by hand. Publishing them via `packages/shared` would remove the drift risk.
7. **Cloudinary asset cleanup cron** — comment images and file attachments currently orphan on the CDN if their DB row is deleted. Nightly reconcile job would close the loop.

---

## License

Private — for assessment evaluation only.
