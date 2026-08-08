# Architecture

How the pieces fit together and how requests flow through them.

## Top-down system diagram

```mermaid
flowchart LR
    subgraph Browser
        WEB["Next.js App<br/>(Vercel)"]
    end

    subgraph AppServers
        API["NestJS API<br/>(Render)"]
    end

    subgraph ManagedServices
        DB[("Postgres<br/>(Neon)")]
        CLOUD[("Cloudinary<br/>authenticated storage")]
        SENTRY[("Sentry<br/>error monitoring")]
    end

    subgraph ThirdParty
        GOOGLE[Google OAuth]
    end

    USER([User's browser]) --> WEB
    WEB -- "REST + Bearer JWT" --> API
    WEB -- "signed upload URL" --> CLOUD
    WEB -- "browser SDK" --> SENTRY

    API -- "Prisma / SQL" --> DB
    API -- "sign upload / read URLs" --> CLOUD
    API -- "@sentry/node interceptor" --> SENTRY
    API -- "OAuth2 code exchange" --> GOOGLE

    USER -.->|"OAuth consent redirect"| GOOGLE
    GOOGLE -.->|"callback"| API
```

## Component responsibilities

### `apps/web` — Next.js frontend (Vercel)

- App Router with route groups for auth (`(auth)/…`) and app shell (`(app)/w/[slug]/…`).
- Server components for initial data fetches where SEO/perf helps; client components for interactive surfaces (Board, Task Detail modal).
- **TanStack Query** owns all server state — caches queries by `[entity, workspaceSlug, id]`, invalidates on mutation, supports optimistic updates for drag-and-drop.
- **Zustand** owns UI state (accent color, sidebar collapsed, modal open).
- **Axios** client with interceptors: attach `Authorization: Bearer <access>`, catch 401 → silent refresh → retry.
- **Intercepted routes** for the Task Detail modal — internal navigation opens modal, direct visit renders full page.
- **Sentry (`@sentry/nextjs`)** auto-instruments App Router, captures Web Vitals, uploads source maps at build time.

### `apps/api` — NestJS backend (Render)

- One module per entity (`AuthModule`, `TasksModule`, `ProjectsModule`, `ResourcesModule`, …).
- Global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })` — mass-assignment protection.
- Global guards: `JwtAuthGuard` (default, decorate `@Public()` to skip), `WorkspaceMemberGuard` (verifies URL `slug` is one of the user's memberships).
- Global interceptor: `SentryInterceptor` — captures unhandled exceptions with request-id context.
- Global middleware: `RequestIdMiddleware` — assigns/echoes `x-request-id` and injects into pino log context.
- **Prisma** as the only DB layer. Zero raw SQL except in migrations. Row-level filtering enforced in service methods, not by clients.
- **Passport** strategies: `JwtStrategy`, `GoogleStrategy`, custom `GuestStrategy`.
- Swagger docs served at `/api/docs` — decorators derive the schema from the code.
- **@nestjs/throttler** enforces rate limits layered per route.

### `packages/shared`

- Enums (`Priority`, `Role`, `ActivityType`, …) and zod schemas for every DTO.
- Both apps import from `@task-mgmt/shared` — one source of truth for request/response shapes.
- No runtime code beyond zod schemas; TypeScript types are derived via `z.infer<>`.

### Postgres (Neon in prod, Docker in dev)

- Single logical DB. All entities live under the `public` schema.
- Prisma migrations tracked in `apps/api/prisma/migrations/` and applied via `prisma migrate deploy` on Render start-up.
- Local dev uses `docker-compose.yml` — Postgres 16 on **host port 5433** (avoids conflict with native Windows Postgres).

### Cloudinary

- Storage type `authenticated` for all task attachments — objects are private by default.
- Uploads: backend signs an upload preset scoped to a specific task; browser uploads direct to Cloudinary.
- Reads: backend mints a 5-minute signed URL after verifying task access.

### Sentry

- Two projects: `task-mgmt-web` and `task-mgmt-api`.
- Environment tag: `development` / `production`.
- Request-id (from pino) attached as a tag so backend and frontend events for the same user action can be correlated.

---

## Auth sequence — Guest Login

```mermaid
sequenceDiagram
    autonumber
    participant U as User (browser)
    participant W as Next.js
    participant A as NestJS API
    participant DB as Postgres

    U->>W: Click "Continue as Guest"
    W->>A: POST /auth/guest
    A->>DB: BEGIN
    A->>DB: INSERT User (isGuest=true, random username, guest-*@guest.local)
    A->>DB: INSERT Workspace (owner=user)
    A->>DB: INSERT WorkspaceMember (OWNER)
    A->>DB: INSERT 4 default Statuses
    A->>DB: INSERT 3-4 seeded teammate Users + Memberships
    A->>DB: INSERT demo Project + demo Tasks
    A->>DB: INSERT UserPreference defaults
    A->>DB: INSERT RefreshToken (hashed)
    A->>DB: COMMIT
    A-->>W: 200 { accessToken, refreshToken, user, workspace }
    W->>W: Store tokens in localStorage
    W-->>U: Redirect to /w/{slug}/tasks
```

## Auth sequence — Google OAuth (new user)

```mermaid
sequenceDiagram
    autonumber
    participant U as User (browser)
    participant W as Next.js
    participant A as NestJS API
    participant G as Google
    participant DB as Postgres

    U->>W: Click "Login with Google"
    W->>A: GET /auth/google (window.location =)
    A-->>U: 302 to Google consent screen (with state)
    U->>G: Approve
    G-->>A: 302 GET /auth/google/callback?code=...&state=...
    A->>G: Exchange code for tokens
    G-->>A: { id_token, access_token }
    A->>G: GET userinfo
    G-->>A: { googleId, email, name, picture }
    A->>DB: SELECT User WHERE googleId OR email
    alt No existing user
        A->>DB: BEGIN, same seed sequence as Guest but isGuest=false
        A->>DB: COMMIT
    else Existing user
        A->>DB: Load user + primary workspace
    end
    A->>DB: INSERT RefreshToken (hashed)
    A-->>U: 302 FRONTEND_URL/auth/callback?token=...&refresh=...
    U->>W: /auth/callback reads tokens
    W->>W: Store in localStorage
    W-->>U: Redirect to /w/{slug}/tasks
```

## Auth sequence — Silent refresh on 401

```mermaid
sequenceDiagram
    autonumber
    participant W as Next.js (Axios interceptor)
    participant A as NestJS API
    participant DB as Postgres

    W->>A: GET /tasks (Bearer expired-access-token)
    A-->>W: 401
    W->>A: POST /auth/refresh { refreshToken }
    A->>DB: SELECT RefreshToken WHERE tokenHash = sha256(input) AND revokedAt IS NULL AND expiresAt > NOW
    alt Valid
        A->>DB: UPDATE old row SET revokedAt=NOW
        A->>DB: INSERT new RefreshToken row
        A-->>W: { accessToken, refreshToken }
        W->>W: Replace tokens in localStorage
        W->>A: Retry original GET /tasks with new access
        A-->>W: 200 { tasks }
    else Invalid / revoked
        A-->>W: 401
        W-->>W: Clear tokens and hard redirect to /login
    end
```

## Auth sequence — Guest → Google merge (P1)

```mermaid
sequenceDiagram
    autonumber
    participant U as User (browser, guest session)
    participant W as Next.js
    participant A as NestJS API
    participant G as Google
    participant DB as Postgres

    U->>W: Click "Login with Google" (while guest)
    W->>A: GET /auth/google?guestToken=<jwt>
    A->>A: Encode guest JWT into OAuth state param
    A-->>U: 302 to Google consent
    U->>G: Approve
    G-->>A: 302 /auth/google/callback?code=...&state=<encoded>
    A->>A: Decode state → recover guest JWT → verify → identify guest User
    A->>G: Exchange code / fetch userinfo
    G-->>A: { googleId, email, name }
    A->>DB: SELECT User WHERE googleId OR email
    alt No existing Google user
        A->>DB: UPDATE guest User SET googleId, email, fullName, isGuest=false
        A-->>U: 302 /auth/callback?token=... (workspace + tasks retained)
    else Existing Google user
        A-->>U: 302 /login?error=account_exists ("log out first" message)
    end
```

---

## File upload sequence

```mermaid
sequenceDiagram
    autonumber
    participant U as User (browser)
    participant W as Next.js (upload UI)
    participant A as NestJS API
    participant C as Cloudinary
    participant DB as Postgres

    U->>W: Choose file, drop on Resources
    W->>A: POST /uploads/sign { taskId }
    A->>DB: SELECT Task join WorkspaceMember on user - verify access
    A->>C: Generate signed upload preset scoped to /tasks/{taskId}/
    A-->>W: { cloudUrl, apiKey, timestamp, signature, folder }
    W->>C: POST direct upload with signed params
    C-->>W: { publicId (cloudinaryKey), mimeType, bytes, ... }
    W->>A: POST /resources { taskId, type: FILE, cloudinaryKey, name, mimeType, sizeBytes }
    A->>DB: Verify access again, INSERT Resource, INSERT Activity(RESOURCE_ADDED)
    A-->>W: 201 { resource }
    W-->>U: Attachment appears in Resources row

    Note over U,C: Later, when viewing:
    U->>W: Open Task Detail
    W->>A: GET /resources/{id}/url
    A->>DB: Verify task access
    A->>C: Sign 5-min-expiring read URL
    A-->>W: { url }
    W-->>U: renders image via signed url or offers download link
```

---

## Request lifecycle (typical authenticated call)

1. Frontend attaches `Authorization: Bearer <access>` and `x-request-id` (generated client-side for correlation).
2. **`RequestIdMiddleware`** ensures a request-id exists (echoes client's or generates one) and stamps it on pino's async context.
3. **`ThrottlerGuard`** (global) checks rate-limit bucket for this IP or user.
4. **`JwtAuthGuard`** (global) validates the access token, hydrates `req.user`.
5. **`WorkspaceMemberGuard`** (route or module level) resolves `slug` from URL, verifies membership, injects `req.workspace`.
6. **`ValidationPipe`** (global) whitelists / transforms body against the DTO.
7. Controller → Service → Prisma. Service enforces workspace-scoped queries: `where: { workspaceId: req.workspace.id, ... }`.
8. If the mutation changes stateful fields, the service writes both the entity update and an `Activity` row in the **same Prisma transaction**.
9. **`SentryInterceptor`** wraps everything — unhandled errors get captured with request-id, user id, workspace slug tagged.
10. Response serialised via `ClassSerializerInterceptor` — `@Exclude`d fields (`passwordHash`, `googleId`, `tokenHash`) never leak.

---

## Deployment topology

| Concern          | Choice              | Why                                                      |
| ---------------- | ------------------- | -------------------------------------------------------- |
| Web hosting      | **Vercel**          | Native Next.js, edge network, zero-config deploys        |
| API hosting      | **Render**          | Free tier for web services, native Docker, easy env vars |
| Database         | **Neon** (Postgres) | Best free tier, branching, serverless                    |
| File storage     | **Cloudinary**      | Generous free tier, signed uploads/reads out of the box  |
| Error monitoring | **Sentry**          | Best-in-class for JS/TS + Next.js + Nest                 |
| Secrets          | Provider dashboards | Never in git                                             |
| CI               | **GitHub Actions**  | Lint + typecheck + test on PR                            |

## Env vars (see `apps/*/.env.example`)

- `apps/api`: `DATABASE_URL`, `JWT_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `FRONTEND_URL`, `CLOUDINARY_*`, `SENTRY_DSN`, `THROTTLE_*`.
- `apps/web`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG/PROJECT/AUTH_TOKEN` (for source-map upload at build time).
