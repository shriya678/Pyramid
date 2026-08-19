# Software Requirements Specification

**Project:** Task Management System (Pyramid)
**Status:** Delivered
**Live web:** https://pyramid-web-sigma.vercel.app/ · **Live API:** https://pyramid-sb7m.onrender.com

---

## 1. Introduction

### 1.1 Purpose

This document defines the functional and non-functional requirements for a Jira/Linear-inspired task management application delivered as a technical assessment for a Full Stack Developer role. It captures **what the system must do** (functional requirements, §3), **how well it must do it** (non-functional requirements, §4), and **what boundaries constrain the solution** (constraints, assumptions, out-of-scope — §5–§7).

Each requirement is written as a testable statement so acceptance can be verified directly against a live build.

### 1.2 Scope

The delivered system is a multi-tenant web application in which teams organise work into workspaces, projects, and tasks. Users authenticate via a one-click guest session or Google OAuth. Every workspace is isolated; access within a workspace is governed by a four-role model. The task-management surface includes a Kanban board with drag-drop, a list view, a task detail with rich-text threaded comments (bold/italic/lists/code/mentions/images), server-side search and filters, notifications, custom statuses and labels, workspace + project members, custom themes, and a settings area.

### 1.3 Definitions and glossary

| Term                                      | Meaning                                                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workspace**                             | Top-level tenant. One or more per user; the URL is `/w/<slug>/…`.                                                                                        |
| **Project**                               | A folder of tasks inside a workspace.                                                                                                                    |
| **Task**                                  | The unit of work. Belongs to a workspace, optionally to a project, optionally to a parent task (subtask).                                                |
| **Status**                                | A workspace-scoped Kanban column (e.g. "To Do"). Custom per workspace, not a fixed enum.                                                                 |
| **Label**                                 | A workspace-scoped tag applied to tasks (many-to-many).                                                                                                  |
| **Resource**                              | An attachment on a task — either a LINK (external URL) or a FILE (Cloudinary-hosted).                                                                    |
| **Activity**                              | An append-only audit event for a task (status changed, comment added, etc.).                                                                             |
| **Mention**                               | An `@username` reference inside a comment body that triggers a Notification for the referenced user.                                                     |
| **IDOR**                                  | Insecure Direct Object Reference — accessing a resource by guessing/enumerating its id. Prevented here via workspace scoping and `ProjectAccessService`. |
| **ProseMirror doc**                       | The JSON shape TipTap emits for rich text comment bodies.                                                                                                |
| **OWNER / ADMIN / MEMBER / COLLABORATOR** | The four workspace roles — see §2.2.                                                                                                                     |

### 1.4 References

- Figma design -https://www.figma.com/design/obONCFmoTFN27V5H9PHS2X/Assessment-Task?node-id=0-1&t;=y9fJEDSLMzDicrBQ-1
- Swagger API documentation — [live](https://pyramid-sb7m.onrender.com/api/docs)
- ER diagram — [`docs/erd.md`](./erd.md)
- Architecture diagram + auth sequences — [`docs/architecture.md`](./architecture.md)

---

## 2. Overall description

### 2.1 Product perspective

A self-contained web application composed of:

- **Frontend** — Next.js 16 App Router SPA-with-shell, deployed to Vercel.
- **Backend** — NestJS 11 REST API, deployed to Render.
- **Database** — PostgreSQL 16, hosted on Neon (serverless).
- **File storage** — Cloudinary (signed uploads, both authenticated and public depending on use).
- **Error monitoring** — Sentry (frontend + backend, correlated by request id).

The system depends on Google as an external identity provider for the OAuth login path.

### 2.2 User classes

| Role             | How assigned                                      | Sees                                                               | Can do                                          |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| **Guest**        | One-click "Continue as Guest"                     | Their own auto-provisioned workspace                               | Everything an OWNER can, in their own workspace |
| **OWNER**        | Workspace creator                                 | Every project + task in the workspace                              | Everything + rename + delete workspace          |
| **ADMIN**        | Workspace-level invite as ADMIN                   | Every project + task                                               | Everything except rename/delete workspace       |
| **MEMBER**       | Workspace-level invite as MEMBER                  | Every project + task                                               | Everything except manage members                |
| **COLLABORATOR** | Project-level invite (auto-creates workspace row) | Only projects they hold a `ProjectMember` row for; no orphan tasks | CRUD tasks under their projects only            |

Guests may upgrade to a Google account in place — the same user id, workspace, and tasks are retained.

### 2.3 Operating environment

- **Client browsers:** modern evergreen (Chrome, Firefox, Safari, Edge — latest two major versions).
- **Viewport support:** mobile (375px), tablet (768px), desktop (1440px) minimum. Fluid between.
- **Runtime:** Node.js 22 LTS (backend + frontend build).
- **Persistence:** PostgreSQL 16.

---

## 3. Functional requirements

Each requirement carries a unique id `FR-x.y`. Figma page references (e.g. `p2`) point to the assessment design set.

### 3.1 Authentication

| #         | Requirement                                                                                                                                                                   | Figma |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-3.1.1  | The login screen shall render brand mark, "Continue as Guest" button, and "Login with Google" button.                                                                         | p1    |
| FR-3.1.2  | "Continue as Guest" shall create a real User (`isGuest: true`) + a Workspace + default seed data (4 statuses, 4 seeded teammates, demo project, demo tasks) and issue tokens. | p1    |
| FR-3.1.3  | "Login with Google" shall complete a full OAuth authorization-code flow and land the user in a workspace (new user → fresh workspace; returning → existing).                  | p1    |
| FR-3.1.4  | Successful authentication shall return a JWT access token (15 min TTL) and an opaque refresh token (30 day TTL, SHA-256 hashed server-side).                                  | –     |
| FR-3.1.5  | The frontend shall silently refresh an expired access token via an Axios response interceptor and retry the original request.                                                 | –     |
| FR-3.1.6  | Refresh tokens shall rotate on every use; the previous token is revoked in the same transaction that issues the new one.                                                      | –     |
| FR-3.1.7  | The system shall expose static Terms of Service and Privacy Policy pages at `/terms` and `/privacy`.                                                                          | p1    |
| FR-3.1.8  | A nightly scheduled job shall delete guest users older than 30 days; their workspaces cascade.                                                                                | –     |
| FR-3.1.9  | A signed-in guest shall be able to upgrade in place to a Google account from the user menu — same user id, workspace, tasks retained.                                         | –     |
| FR-3.1.10 | The upgrade shall be rejected with an inline explanation if the target Google account already belongs to a different real user.                                               | –     |
| FR-3.1.11 | `POST /auth/logout` shall revoke the caller's refresh token idempotently.                                                                                                     | –     |

### 3.2 Layout and navigation

| #        | Requirement                                                                                                                                                             | Figma      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| FR-3.2.1 | A persistent sidebar shall show the workspace header (avatar + name), a Tasks link, and a Projects link on every workspace page.                                        | p2, p4, p9 |
| FR-3.2.2 | Clicking the workspace header shall open a dropdown containing: workspaces switcher, "+ Create workspace", theme submenu, accent-color submenu, Settings, and Sign out. | p9         |
| FR-3.2.3 | The sidebar shall provide a collapse toggle (icon-only rail on desktop).                                                                                                | p2         |
| FR-3.2.4 | Each main content page shall render a top bar with title, right-aligned actions (search, filters, primary CTA), and a notification bell.                                | p2, p4, p9 |
| FR-3.2.5 | The Project detail page shall render breadcrumbs (`Projects › <Project Name>`).                                                                                         | p12        |
| FR-3.2.6 | On viewports narrower than 768px, the sidebar shall collapse to a hamburger drawer.                                                                                     | –          |
| FR-3.2.7 | The workspace switcher shall list every workspace the user is a member of and support switching without a full page reload.                                             | –          |
| FR-3.2.8 | The "+ Create workspace" affordance shall open a modal that on submit provisions a clean workspace (default statuses only, no demo seed) and routes to it.              | –          |

### 3.3 Board view (Kanban)

| #         | Requirement                                                                                                                 | Figma |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-3.3.1  | The board shall render one column per workspace Status, ordered ascending by `Status.order`.                                | p2    |
| FR-3.3.2  | Each column header shall show the status name, current task count, an inline "+ Add task" affordance, and an overflow menu. | p2    |
| FR-3.3.3  | Task cards shall display title, one assignee avatar, a due date badge (red when overdue), and up to two labels.             | p2    |
| FR-3.3.4  | Cards shall be draggable between columns; the drop shall PATCH `statusId` with optimistic UI and roll back on error.        | p2    |
| FR-3.3.5  | Cards shall be draggable within a column; the drop shall PATCH `orderInColumn` using a fractional index.                    | p2    |
| FR-3.3.6  | Column headers shall be draggable to reorder statuses (PATCH `Status.order`).                                               | p2    |
| FR-3.3.7  | Each column shall support inline "+ Add Task" that creates a task with the column's `statusId`.                             | p2    |
| FR-3.3.8  | The board shall scroll horizontally when it does not fit; column headers shall remain sticky.                               | p2    |
| FR-3.3.9  | A task shall be considered overdue when `dueDate < today AND status.name !== 'Completed'`.                                  | p2    |
| FR-3.3.10 | A Board / List segmented control shall appear top-right; the selection shall persist to `UserPreference.defaultView`.       | p3    |

### 3.4 List view

| #        | Requirement                                                               | Figma |
| -------- | ------------------------------------------------------------------------- | ----- |
| FR-3.4.1 | Tasks shall be grouped by Status; group headers shall be collapsible.     | p4    |
| FR-3.4.2 | Columns: Task, Priority, Members, Due Date, Actions.                      | p4    |
| FR-3.4.3 | Column visibility shall respect `UserPreference.listFieldsShown`.         | p7    |
| FR-3.4.4 | Each group shall support an inline "+ Add Task" affordance at its bottom. | p4    |
| FR-3.4.5 | Clicking a row shall open the Task Detail modal.                          | p4    |

### 3.5 Filters, search, and fields

| #        | Requirement                                                                                                        | Figma  |
| -------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| FR-3.5.1 | A search input shall filter tasks by title server-side with a 300 ms debounce.                                     | p5     |
| FR-3.5.2 | A filter popover shall support multi-select filters for Status, Priority, Members, Due Date, Labels, and Reporter. | p11    |
| FR-3.5.3 | Filter semantics: AND across sections, OR within a section.                                                        | p11    |
| FR-3.5.4 | Filter state shall serialize to URL query parameters so filtered views are shareable.                              | –      |
| FR-3.5.5 | A Fields popover shall toggle which columns/badges are visible; the choice shall persist per user per view.        | p3, p7 |
| FR-3.5.6 | Field toggles: Priority, Members, Due Date, Labels, Status, Reporter.                                              | p3     |
| FR-3.5.7 | The Projects list shall provide an equivalent Fields popover with project-specific fields.                         | p9     |

### 3.6 Task detail

| #         | Requirement                                                                                                                                                                                 | Figma |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-3.6.1  | Clicking a card from the Board or List shall open the task detail as an intercepted modal overlay.                                                                                          | p6    |
| FR-3.6.2  | Direct navigation to the task URL shall render the task detail full-page.                                                                                                                   | p6    |
| FR-3.6.3  | An expand icon shall open the full-page view in a new browser tab.                                                                                                                          | p6    |
| FR-3.6.4  | Title and description shall be inline-editable (title plain, description markdown-rendered).                                                                                                | p6    |
| FR-3.6.5  | A Properties row shall show assignee avatars and due date.                                                                                                                                  | p6    |
| FR-3.6.6  | A Labels row shall let the user toggle existing workspace labels; an inline "+ New label" popover shall create a label (with a color picker) and immediately assign it to the current task. | p6    |
| FR-3.6.7  | A Resources row shall accept a pasted URL (creates a LINK resource) or a file upload (creates a FILE resource).                                                                             | p6    |
| FR-3.6.8  | A Subtasks section shall render a mini-list of one-level subtasks with Task/Priority/Members/Due Date columns and a "+ Add Subtask" affordance.                                             | p6    |
| FR-3.6.9  | The right Details panel shall render Status, Priority, Members, Dates, Labels, Teams (see FR-7.1 constraint), Reporter.                                                                     | p6    |
| FR-3.6.10 | Every Details panel field shall be inline-editable with debounced auto-save (500 ms) and a "Saving…"/"Saved" indicator.                                                                     | p6    |
| FR-3.6.11 | The date picker shall be a range picker (start + end) via react-day-picker.                                                                                                                 | p8    |
| FR-3.6.12 | A right-side Activity feed shall interleave system events and user-authored notes.                                                                                                          | p6    |
| FR-3.6.13 | On viewports narrower than 768px, the task detail shall render as a full-screen sheet, not an overlay.                                                                                      | –     |

### 3.7 Comments (rich text)

| #         | Requirement                                                                                                                                                                   | Figma |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-3.7.1  | The comment composer shall be a TipTap-based rich text editor with a formatting toolbar.                                                                                      | p6    |
| FR-3.7.2  | Formatting supported: bold, italic, strike-through, inline code, headings (H1/H2/H3), bullet + ordered lists, blockquote, code block, links.                                  | –     |
| FR-3.7.3  | Keyboard shortcuts: `Cmd/Ctrl+B` (bold), `Cmd/Ctrl+I` (italic), `Cmd/Ctrl+E` (inline code); markdown-style prefixes (`-`, `1.`, `#`, ```) for lists / headings / code blocks. | –     |
| FR-3.7.4  | Comment bodies shall be persisted as ProseMirror JSON documents.                                                                                                              | –     |
| FR-3.7.5  | Top-level comments shall render newest-first; replies within a thread shall render chronologically.                                                                           | –     |
| FR-3.7.6  | Replies are limited to one nesting level.                                                                                                                                     | –     |
| FR-3.7.7  | The editor shall support a `@`-typeahead picker of workspace members; selecting a member shall insert a `type: 'mention'` node whose `attrs.id` is the userId.                | –     |
| FR-3.7.8  | Manually-typed `@username` (without picker) shall still deliver as a mention via a regex fallback.                                                                            | –     |
| FR-3.7.9  | Pasting an image, dropping an image file onto the editor, or picking one via the toolbar shall upload it directly to Cloudinary and insert it as an image node.               | –     |
| FR-3.7.10 | Inserted images shall be resizable via a width picker (25 / 50 / 75 / 100%) that appears on hover or selection.                                                               | –     |
| FR-3.7.11 | Comment authors shall be able to edit their own comments; workspace OWNER/ADMIN may delete any comment.                                                                       | p6    |

### 3.8 Activity feed

| #        | Requirement                                                                                                                                                                                                                | Figma |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-3.8.1 | The system shall write an Activity row for every task mutation: TASK_CREATED, STATUS_CHANGED, PRIORITY_CHANGED, DUE_DATE_CHANGED, MEMBER_ADDED, MEMBER_REMOVED, LABEL_ADDED, LABEL_REMOVED, COMMENT_ADDED, RESOURCE_ADDED. | p6    |
| FR-3.8.2 | Activity writes shall be transactional with the mutation they describe — no orphan or missing rows.                                                                                                                        | –     |

### 3.9 Attachments (resources)

| #        | Requirement                                                                                                                                       | Figma |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-3.9.1 | A pasted URL in the Resources input shall create a LINK resource.                                                                                 | p6    |
| FR-3.9.2 | A file upload shall use signed direct-to-Cloudinary upload (`type=authenticated`); backend authorizes before signing.                             | p6    |
| FR-3.9.3 | File rendering shall use a `GET /resources/:id/url` endpoint returning a 5-minute-expiring signed URL, gated by task access.                      | –     |
| FR-3.9.4 | Image resources shall show inline; non-image types shall show an icon + filename.                                                                 | –     |
| FR-3.9.5 | Inline comment images (FR-3.7.9) shall use a separate public-mode upload path so the embedded URL keeps working without re-signing on every read. | –     |

### 3.10 Projects

| #         | Requirement                                                                                                                                                    | Figma |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-3.10.1 | The Projects list shall render a table with columns Project, Priority, Lead, Due Date, and row actions.                                                        | p9    |
| FR-3.10.2 | "+ Add Project" shall open a modal capturing name, description, priority, lead, and due date.                                                                  | p9    |
| FR-3.10.3 | The Project detail shall render breadcrumbs + a compact editable header (name, description, lead, priority, due) + the Board/List views scoped to `projectId`. | p12   |
| FR-3.10.4 | "+ Add Task" from within a project shall pre-set `projectId` on the new task.                                                                                  | p12   |
| FR-3.10.5 | Filter/search/Fields on the Projects list shall mirror the Tasks patterns.                                                                                     | p11   |

### 3.11 Members and access control

| #         | Requirement                                                                                                                                             | Figma |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-3.11.1 | Two invite gestures shall exist: workspace-level (`POST /workspaces/:slug/members`) and project-level (`POST /workspaces/:slug/projects/:id/members`).  | –     |
| FR-3.11.2 | Workspace invite shall accept role MEMBER or ADMIN (never OWNER, never COLLABORATOR via this endpoint).                                                 | –     |
| FR-3.11.3 | Project invite shall auto-create a `COLLABORATOR` workspace-member row for invitees who have no workspace membership yet.                               | –     |
| FR-3.11.4 | The Settings → Workspace Members panel shall list members with role chips and support remove (OWNER/ADMIN only).                                        | –     |
| FR-3.11.5 | The Project detail → Project Members panel shall list contributors with add/remove affordances (OWNER/ADMIN only).                                      | –     |
| FR-3.11.6 | A user shall be able to leave a workspace from Settings; sole OWNERs are blocked (must delete the workspace instead).                                   | –     |
| FR-3.11.7 | An OWNER shall be able to delete a workspace from Settings after typing the workspace name to confirm. Deletion cascades to every workspace-scoped row. | –     |
| FR-3.11.8 | Every read and write shall scope through `ProjectAccessService`. Denials return 404 (not 403) to avoid leaking resource existence.                      | –     |
| FR-3.11.9 | An OWNER cannot be removed as the last OWNER of a workspace (400).                                                                                      | –     |

### 3.12 Statuses (custom per workspace)

| #         | Requirement                                                                                                                             | Figma |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-3.12.1 | Every new workspace shall be seeded with 4 default statuses: To Do, Doing, Completed, On Hold.                                          | p2    |
| FR-3.12.2 | Settings shall provide UI to add, rename, recolor, reorder, and delete statuses.                                                        | –     |
| FR-3.12.3 | Deleting a status that has tasks shall require the caller to select a destination status; tasks are moved before the status is removed. | –     |
| FR-3.12.4 | The last remaining status shall not be deletable.                                                                                       | –     |

### 3.13 Notifications

| #         | Requirement                                                                                                                             | Figma |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| FR-3.13.1 | Each `@mention` in a new comment shall create a Notification row for the mentioned user, in the same transaction as the comment insert. | –     |
| FR-3.13.2 | Self-mentions and mentions of seeded fake teammates shall be silently skipped.                                                          | –     |
| FR-3.13.3 | A bell icon in the workspace top bar shall display the current unread count (polled every 30 s).                                        | –     |
| FR-3.13.4 | Clicking a notification row shall navigate to the referenced task and mark the notification read.                                       | –     |
| FR-3.13.5 | A "Mark all as read" action shall be available in the popover header when at least one unread exists.                                   | –     |

### 3.14 Settings and profile

| #         | Requirement                                                                                                                                                                             | Figma   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| FR-3.14.1 | Settings shall live at `/settings` with a "← Back to app" affordance.                                                                                                                   | p13     |
| FR-3.14.2 | A Profile panel shall allow editing full name, username, title, and avatar URL (toggle-based edit mode).                                                                                | p13     |
| FR-3.14.3 | Username shall be workspace-unique and validated (lowercase kebab-ish, 2–30 chars).                                                                                                     | –       |
| FR-3.14.4 | Theme (light / dark / system) and accent color (6 presets) shall be selectable from the sidebar user menu; both shall persist in localStorage and sync to `UserPreference` server-side. | p9, p10 |
| FR-3.14.5 | Settings shall include destructive Leave Workspace and Delete Workspace sections gated per §3.11.                                                                                       | p13     |

---

## 4. Non-functional requirements

### 4.1 Security

| #         | Requirement                                                                                                                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-4.1.1 | The backend shall apply a global ValidationPipe (`whitelist`, `forbidNonWhitelisted`, `transform`) so unknown request fields are rejected — mass assignment blocked.                                                                |
| NFR-4.1.2 | Every entity read/write shall enforce row-level authorization scoped by the caller's workspace membership. Denials return 404.                                                                                                      |
| NFR-4.1.3 | XSS shall be prevented by React's default escaping, refusal to use `dangerouslySetInnerHTML` on user input, sanitized rendering of markdown/rich text, and a Content-Security-Policy header restricting script/style/image origins. |
| NFR-4.1.4 | Rate limiting shall be enforced via `@nestjs/throttler`: global 100/min/IP, `/auth/guest` 10/day/IP, `/auth/refresh` 60/hr/IP, `/resources/sign-upload` and `/resources/sign-inline-image` 20/min/user.                             |
| NFR-4.1.5 | Cloudinary file uploads shall use `type=authenticated`; read URLs shall be backend-signed with a 5-minute expiry. Inline comment images may use `type=upload` as a documented trade-off.                                            |
| NFR-4.1.6 | Helmet security headers shall be applied; CORS shall allowlist the deployed frontend origin only; JWT secret shall come from environment.                                                                                           |
| NFR-4.1.7 | Sensitive fields (`passwordHash`, `googleId`, `tokenHash`, `refreshToken`) shall never appear in API responses.                                                                                                                     |
| NFR-4.1.8 | Refresh tokens shall be stored server-side as SHA-256 hashes; the raw token is only ever returned to the client that issued it.                                                                                                     |

### 4.2 Performance and scalability

| #         | Requirement                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NFR-4.2.1 | Board drag reordering shall be O(1) writes per drag (fractional indexing) with no fan-out to other rows.                                                     |
| NFR-4.2.2 | List queries shall return in under 500 ms at typical dataset sizes (up to ~1k tasks per workspace).                                                          |
| NFR-4.2.3 | Client-side mutation UX shall use optimistic updates for latency-critical flows (drag-drop, inline field edits).                                             |
| NFR-4.2.4 | TanStack Query cache shall serve repeat reads without a network round-trip within its configured staleTime windows.                                          |
| NFR-4.2.5 | File bytes shall never proxy through the API server — uploads go direct browser → Cloudinary.                                                                |
| NFR-4.2.6 | The notification bell shall poll the cheap unread-count endpoint (indexed COUNT) at 30 s intervals; the full list shall only fetch when the popover is open. |

### 4.3 Accessibility

| #         | Requirement                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-4.3.1 | Interactive controls shall be keyboard-reachable and operable (Tab / Shift+Tab / Enter / Space / Escape / arrow keys where applicable). |
| NFR-4.3.2 | Focus states shall be visible on every focusable element (2px ring).                                                                    |
| NFR-4.3.3 | Dialogs, popovers, and dropdowns shall use ARIA roles and support Escape to close.                                                      |
| NFR-4.3.4 | Semantic HTML shall be used (heading levels, landmark roles, list elements, form labels).                                               |
| NFR-4.3.5 | Text and interactive-element contrast shall meet WCAG AA on both light and dark themes.                                                 |

### 4.4 Responsiveness

| #         | Requirement                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------- |
| NFR-4.4.1 | The application shall render usably on mobile (375 px), tablet (768 px), and desktop (1440 px) viewports. |
| NFR-4.4.2 | The sidebar shall collapse to a hamburger drawer at viewports narrower than 768 px.                       |
| NFR-4.4.3 | The Kanban board shall support horizontal scroll with sticky headers on narrow viewports.                 |
| NFR-4.4.4 | Task detail shall render as a full-screen sheet (not an overlay) on narrow viewports.                     |

### 4.5 Observability

| #         | Requirement                                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-4.5.1 | Every backend request shall carry an `x-request-id` (generated or forwarded); the id shall appear in every pino log line for that request and in every Sentry event captured during it. |
| NFR-4.5.2 | Backend logs shall be structured JSON via pino; each line shall include request-id, user-id, method, path, status, latency.                                                             |
| NFR-4.5.3 | Unhandled backend exceptions shall be captured to Sentry with request-id, user-id, and workspace-slug as tags.                                                                          |
| NFR-4.5.4 | Frontend runtime errors, unhandled promise rejections, and Web Vitals shall be captured to Sentry.                                                                                      |
| NFR-4.5.5 | Source maps shall be uploaded to Sentry at build time so stack traces resolve to original source.                                                                                       |

### 4.6 Reliability

| #         | Requirement                                                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-4.6.1 | Prisma migrations shall be reversible in principle (paired `up`/`down` via git history) and applied in production via `prisma migrate deploy`.                                                      |
| NFR-4.6.2 | Multi-step business writes (workspace provisioning, comment + activity + notification emit, refresh-token rotation) shall run in a single Prisma transaction — either all succeed or all roll back. |
| NFR-4.6.3 | Concurrent identical queries shall be deduped at the client cache layer (TanStack Query) to avoid stampedes.                                                                                        |

### 4.7 Maintainability

| #         | Requirement                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| NFR-4.7.1 | The codebase shall be a pnpm monorepo (`apps/api`, `apps/web`, `packages/shared`).                                               |
| NFR-4.7.2 | TypeScript strict mode shall be enabled in both apps.                                                                            |
| NFR-4.7.3 | Every backend service exposing business logic shall carry Jest unit-test coverage of its authorization branches and error paths. |
| NFR-4.7.4 | A GitHub Actions CI pipeline shall run lint + typecheck + tests on every pull request.                                           |
| NFR-4.7.5 | Commits shall follow Conventional Commits; PRs shall carry a summary and a testing checklist.                                    |
| NFR-4.7.6 | Every non-obvious design decision shall be commented in-place explaining _why_ (the _what_ is visible in the diff).              |

### 4.8 Documentation and API

| #         | Requirement                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-4.8.1 | The backend shall auto-generate OpenAPI/Swagger documentation at `/api/docs`.                                                                            |
| NFR-4.8.2 | The repository shall include an ER diagram (`docs/erd.md`) and an architecture diagram with auth sequences and Cloudinary flow (`docs/architecture.md`). |
| NFR-4.8.3 | A README shall document setup, live URLs, feature scope, access model, and honest deviations from the design.                                            |
| NFR-4.8.4 | A Postman collection shall exercise every endpoint end-to-end, including auth flows and negative-path assertions.                                        |

---

## 5. Constraints

### 5.1 Technical

- Node.js 22 LTS (backend runtime + frontend build).
- PostgreSQL 16 accessed via Prisma 5.
- Next.js 16 with the App Router (Turbopack). React 19.
- NestJS 11 for the backend.
- pnpm 10 workspaces.
- TipTap 3 for rich text.
- TypeScript strict mode.
- Deployment targets: Vercel (web), Render (api), Neon (DB), Cloudinary (files), Sentry (errors).

### 5.2 Design

- The delivered UI shall respect the intent of the 13-page Figma design set; deliberate deviations shall be surfaced in the README rather than silently applied.
- The four-role access model shall drive both the invite gestures and the visibility rules — no ad-hoc role checks in feature code.

---

## 6. Assumptions

- Guest sessions are ephemeral by design; the 30-day guest-cleanup cron enforces that.
- Cloudinary account is configured and the credentials are set in the deploy environment; if not, upload endpoints return 500 by design (documented) rather than the app failing to boot.
- Users have modern browsers with `fetch`, ES2020, `Intl`, and `crypto.subtle` support.
- The seeded fake teammates in every fresh workspace are for demo colour and are treated as unreachable users by notification delivery.

---

## 7. Out of scope

- File upload beyond Cloudinary (S3, direct downloads with progress indicators).
- Realtime collaboration (WebSockets, live presence, live board updates).
- Email notifications for mentions or activity digests.
- Password/email-based sign-up (only Guest + Google).
- Task recurrence.
- Public / read-only shared boards.
- Import / export.
- Time tracking.
- Multi-language / i18n.
- Full drag-handle image resize inside the rich text editor (a preset-percentage picker is provided instead).
- Text color and slash-command menu inside the rich text editor.
- Live presence avatars on the Board (static seeded teammate avatars are rendered instead).
- Teams model + Task Detail Teams field (the field is rendered as disabled in the UI).

---

## 8. Traceability

Every FR listed in §3 maps to a testable path either through Swagger, the Postman collection, or the UI. The Postman collection (`docs/postman/task-mgmt.postman_collection.json`) organises requests into 15 folders that mirror the FR groupings and includes negative-path assertions (401 without a bearer, 403 for insufficient role, 404 for cross-workspace access, 409 for uniqueness violations, 400 for validation failures).
