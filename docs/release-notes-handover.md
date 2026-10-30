# Release notes ("What's new") — handover for porting

Last verified against `master` on 2026-10-30 (commits `4284479`, `090bf97`, `66650de`, `3ebf03d`). Every path, symbol and behaviour below was read from source, not recalled. Two items are explicitly marked **assumed**.

Target stack this document assumes you already have: SvelteKit 2 with `@sveltejs/adapter-node`, Svelte 5 runes, Tailwind CSS v4 + `@tailwindcss/typography`, shadcn-svelte (bits-ui 2.x), `sveltekit-superforms` 2 + Zod 4, better-auth with the admin plugin and access control, Prisma 7 on PostgreSQL, `svelte-sonner` toasts, Docker Compose.

---

## 1. What the feature does

A super user publishes a release note (title + markdown body) from `/admin/features`. Publishing is immediate; there is no draft state. Every signed-in user then sees it on three surfaces:

| Surface                 | When                                                               | Component                                                        |
| ----------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Announcement dialog     | Next full page load / sign-in while at least one release is unread | `src/lib/components/releases/release-announcement-dialog.svelte` |
| Bell menu in the header | Always; unread dot + list of every release                         | `src/lib/components/releases/release-menu.svelte`                |
| "Refresh" toast         | Live, in every open tab, the moment a release is published         | `src/lib/state/release-events.svelte.ts` (SSE client)            |

Admins additionally get: a table with a per-release "Read by" count, **View**, **Edit** (a silent correction, nobody is re-notified), **Notify users** (one email per selected user), and an **AI** button that reformats the markdown body without changing its content. The server stamps every release with the Docker build identifier (`YYYYMMDD-<sha7>`), which the client can never choose.

---

## 2. File map

### Shared contract + server logic (`src/lib/services/releases/`)

| File                       | Purpose                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `releases.ts`              | Browser-safe: types, Zod schemas, URL constants, dependency/lock/channel names, pure `buildReleaseInboxItems`.   |
| `releases.server.ts`       | Prisma queries: list, detail, create (with author auto-read + SSE publish), update, inbox for a user, mark read. |
| `release-form.ts`          | Zod + superforms schemas for create/edit, length limits, `normalizeReleaseBody` (CRLF → LF).                     |
| `release-version.ts`       | Pure `formatBuildVersion(date, sha)` → `YYYYMMDD-<sha7>` and the `"dev"` constant.                               |
| `release-events.server.ts` | In-process pub/sub hub on `globalThis` used by the SSE route.                                                    |
| `release-notify.server.ts` | Recipient list + per-user email send loop.                                                                       |
| `release-email.server.ts`  | Pure email template: markdown → inline-styled HTML + plain text.                                                 |
| `release-format.server.ts` | Optional: Mastra agent that reformats the markdown body (the "AI" button).                                       |
| `*.test.ts` (5 files)      | Vitest unit tests for the above.                                                                                 |

### Client state

| File                                     | Purpose                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/lib/state/release-events.svelte.ts` | App-global store: one `EventSource` per browser (Web Lock + BroadcastChannel), toast, `liveReleaseIds`. |

### API routes

| Route file                                             | Endpoint                              |
| ------------------------------------------------------ | ------------------------------------- |
| `src/routes/api/releases/stream/+server.ts`            | `GET /api/releases/stream` (SSE)      |
| `src/routes/api/releases/read/+server.ts`              | `POST /api/releases/read`             |
| `src/routes/api/releases/[id]/+server.ts`              | `GET /api/releases/:id`               |
| `src/routes/api/admin/releases/recipients/+server.ts`  | `GET /api/admin/releases/recipients`  |
| `src/routes/api/admin/releases/[id]/notify/+server.ts` | `POST /api/admin/releases/:id/notify` |
| `src/routes/api/admin/releases/format/+server.ts`      | `POST /api/admin/releases/format`     |
| `src/routes/api/admin/releases/format/server.test.ts`  | Route test for the format endpoint    |

### Pages and layout

| File                                        | Purpose                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/routes/admin/features/+page.server.ts` | Load (releases, two superforms, build version) + actions `createRelease`, `updateRelease`. |
| `src/routes/admin/features/+page.svelte`    | Admin page: header with build badge, table, four dialogs.                                  |
| `src/routes/+layout.server.ts`              | Ships `releaseInbox` to every page; `event.depends("app:releases")`.                       |
| `src/routes/+layout.svelte`                 | Inits/destroys the SSE store; mounts `ReleaseAnnouncementDialog` and `TopNav`.             |
| `src/routes/admin/+page.svelte`             | Admin landing card linking to `/admin/features` (gated by `data.access.releases`).         |

### Components

| File                                                             | Purpose                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/lib/components/navigation/top-nav.svelte`                   | Header; mounts `<ReleaseMenu />`.                                               |
| `src/lib/components/releases/release-menu.svelte`                | Bell button + popover list + opens `ReleaseDialog`.                             |
| `src/lib/components/releases/release-dialog.svelte`              | Read-only dialog for one release; shared by three callers.                      |
| `src/lib/components/releases/release-announcement-dialog.svelte` | Login-time "What's new" dialog.                                                 |
| `src/lib/components/releases/release-markdown.svelte`            | Renders markdown body (marked + DOMPurify, browser-only).                       |
| `src/lib/components/admin/releases/releases-table.svelte`        | Admin table.                                                                    |
| `src/lib/components/admin/releases/release-form-dialog.svelte`   | Create/edit form with textarea + live preview + AI button.                      |
| `src/lib/components/admin/releases/notify-users-dialog.svelte`   | Recipient picker + send.                                                        |
| `src/lib/components/ai-chat/markdown.ts`                         | `renderMarkdown(text)`: marked (gfm, breaks) → DOMPurify. Pre-existing, reused. |

### Server infrastructure reused

| File                                                | What the feature uses                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/lib/server/env.ts`                             | `getAppBuildVersion()`, `getPublicBaseUrl()`.                                    |
| `src/lib/server/mailer.server.ts`                   | `sendEmail()` (nodemailer, cached transport).                                    |
| `src/lib/server/notifications/notifications-env.ts` | `hasMailTransport()`, SMTP env parsing.                                          |
| `src/lib/server/auth-guards.ts`                     | `requireAuthenticatedApiUser`, `requirePermission`, `requireApiAdminPermission`. |
| `src/lib/auth/permissions.ts`                       | `release: ["manage"]` statement, granted to `superUser`.                         |
| `src/lib/server/mastra/env.ts`                      | `getReleaseFormatEnv()` (optional AI formatter).                                 |

### Build

| File                       | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `Dockerfile`               | Builder computes `BUILD_VERSION`; runner copies it next to the app.        |
| `.dockerignore`            | Excludes `.git` but re-includes `HEAD`, `packed-refs`, `refs/heads/`.      |
| `scripts/build-version.ts` | Computes `YYYYMMDD-<sha7>` from the `.git` files, no git binary needed.    |
| `scripts/docker-build.ts`  | Optional helper: `bun run docker:build` passes the version as a build arg. |
| `docker-compose.yml`       | Passes `APP_BUILD_VERSION` through as a build arg (empty by default).      |

---

## 3. Database schema

Two tables, both additive. Migration folder: `prisma/migrations/20261029120000_add_release/`.

### Prisma models (verbatim from `prisma/schema.prisma`)

```prisma
/// A published "what's new" note (/admin/features). Saving publishes immediately; there is no draft state.
model Release {
  id              Int           @id @default(autoincrement())
  /// Build the note was published from (APP_BUILD_VERSION, e.g. 20261029-ab12cd3; "dev" locally). Not unique on purpose.
  version         String
  title           String
  /// Markdown body (LF-normalised). Rendered client-side only (marked + DOMPurify).
  body            String
  /// Author; null once the user is deleted.
  createdByUserId String?
  createdBy       user?         @relation("ReleaseAuthor", fields: [createdByUserId], references: [id], onDelete: SetNull)
  createdAt       DateTime      @default(now())
  reads           ReleaseRead[]

  @@index([createdAt])
}

/// One row per (user, release) once the user has seen it. Absence = unread.
model ReleaseRead {
  userId    String
  releaseId Int
  readAt    DateTime @default(now())
  user      user     @relation(fields: [userId], references: [id], onDelete: Cascade)
  release   Release  @relation(fields: [releaseId], references: [id], onDelete: Cascade)

  @@id([userId, releaseId])
}
```

Two back-relations were added to the better-auth `user` model:

```prisma
  releases      Release[]     @relation("ReleaseAuthor")
  release_reads ReleaseRead[]
```

### Migration SQL (verbatim)

```sql
-- CreateTable
CREATE TABLE "Release" (
    "id" SERIAL NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseRead" (
    "userId" TEXT NOT NULL,
    "releaseId" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseRead_pkey" PRIMARY KEY ("userId","releaseId")
);

-- CreateIndex
CREATE INDEX "Release_createdAt_idx" ON "Release"("createdAt");

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseRead" ADD CONSTRAINT "ReleaseRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseRead" ADD CONSTRAINT "ReleaseRead_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### Design decisions worth keeping

- **`version` is not unique.** Several notes can be published from the same build (hotfix notes, a forgotten item). Do not add a unique constraint.
- **Read state is a join table, not a JSON column on `user`.** It gives you the "Read by" count with one `_count`, cascades cleanly when a release or user is deleted, and is idempotent (`createMany … skipDuplicates`, `upsert`).
- **Author deletion keeps the note** (`SetNull`); the UI shows "—" for the author.
- **No `updatedAt`.** Edits are deliberately invisible to users (see §9).
- **Body is LF-normalised** before insert (`normalizeReleaseBody`), so a note written on Windows and one written on macOS hash and diff identically.

**Assumed:** whether this migration has been applied to our production DB. On 2026-10-29 it had not (the team's rule is no migration without sign-off). Check `_prisma_migrations` before relying on it.

---

## 4. Auth and permissions

### Permission statement

In `src/lib/auth/permissions.ts` the better-auth access-control statement gains one resource:

```ts
export const statement = {
  ...defaultStatements,
  // …existing resources…
  release: ["manage"],
} as const;
```

Only the `superUser` role is granted `release: ["manage"]`. The plain `admin` role is **not**; it can reach `/admin` but gets redirected home from `/admin/features`.

### Three layers of gating

1. **`src/hooks.server.ts`** resolves the session on every request. Unauthenticated requests to non-public, non-`/api` paths redirect to `/login`. Requests to `/admin/*` additionally require `canAccessAdminSection(role)`. Note the carve-out: **`/api/*` is outside the login redirect**, so every API route must check auth itself.
2. **Page load / actions** in `src/routes/admin/features/+page.server.ts` call `requirePermission(event, { release: ["manage"] })`, which redirects to `/` when the permission is missing.
3. **API routes**:
   - User-facing (`/api/releases/*`) call `requireAuthenticatedApiUser(event)` → HTTP 401 when there is no session.
   - Admin-facing (`/api/admin/releases/*`) call `requireApiAdminPermission(event, { release: ["manage"] })` → 401 without a session, 403 unless the user holds an admin-class role **and** the permission.

Why 401 instead of a redirect matters: `EventSource` treats any non-200 as terminal and stops reconnecting. A 302 to `/login` would make the browser follow it and fail in confusing ways; a clean 401 lets the client store release its Web Lock so another tab can take over after re-login (§7).

### Permission check implementation (for reference)

```ts
export async function userHasPermissionById(
  userId: string,
  permissions: AppPermissions,
) {
  // Pass the user id so Better Auth evaluates the union across all of the
  // user's stored roles (the `role` column may be a comma-separated list).
  const result = await auth.api.userHasPermission({
    body: { userId, permissions },
  });
  return result.success;
}
```

---

## 5. How read state is tracked

| Event                                                   | DB effect                                                                                           | Caller                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Super user publishes                                    | `Release` insert **and** `ReleaseRead` insert for the author, in one `$transaction`                 | `createRelease` in `releases.server.ts`               |
| User dismisses the announcement dialog (any close path) | `POST /api/releases/read` `{ all: true }` → `createMany` for every unread release, `skipDuplicates` | `release-announcement-dialog.svelte`                  |
| User opens one release from the bell menu               | `POST /api/releases/read` `{ releaseId }` → `upsert` on `(userId, releaseId)`                       | `release-menu.svelte`, only when `item.read` is false |
| Admin edits a release                                   | **Nothing.** Read rows are kept so nobody is re-prompted.                                           | `updateRelease`                                       |
| Admin emails users                                      | **Nothing.** Email is not a read.                                                                   | `notifyUsersOfRelease`                                |

The author auto-read inside the transaction is what prevents the publisher from seeing their own announcement dialog on their next load.

### Inbox computation

`getReleaseInboxForUser(userId)` runs one query that selects every release summary (no bodies) with a filtered `reads` relation for this user, then the pure helper:

```ts
export function buildReleaseInboxItems(
  rows: ReleaseSummary[],
  readIds: ReadonlySet<number>,
) {
  const items = rows
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
    .map((row) => ({ ...row, read: readIds.has(row.id) }));
  const unread = items.filter((item) => !item.read);
  return {
    items,
    unreadCount: unread.length,
    newestUnreadId: unread[0]?.id ?? null,
  };
}
```

Only then is **one** body fetched, for `newestUnreadId`, to feed the announcement dialog. Bodies are never shipped in bulk; the bell menu fetches a body on demand via `GET /api/releases/:id`.

The admin table's "Read by" column is `_count: { select: { reads: true } }` on the same query.

---

## 6. API contracts

All JSON. Validation with Zod; schemas live in `src/lib/services/releases/releases.ts` so client and server share them.

### Shared types

```ts
export type ReleaseSummary = {
  id: number;
  version: string;
  title: string;
  createdAt: string; // ISO
  createdByName: string | null; // name, else email, else null
};
export type ReleaseInboxItem = ReleaseSummary & { read: boolean };
export type ReleaseDetail = ReleaseSummary & { body: string };
export type ReleaseInbox = {
  items: ReleaseInboxItem[]; // newest first
  unreadCount: number;
  newestUnread: ReleaseDetail | null;
};
```

### User-facing

| Method + path              | Guard                         | Request                                        | Response                    | Errors                                 |
| -------------------------- | ----------------------------- | ---------------------------------------------- | --------------------------- | -------------------------------------- |
| `GET /api/releases/stream` | `requireAuthenticatedApiUser` | —                                              | `text/event-stream`, see §7 | 401                                    |
| `POST /api/releases/read`  | `requireAuthenticatedApiUser` | `{ all: true }` **or** `{ releaseId: number }` | `{ unreadCount: number }`   | 400 invalid JSON/shape, 404 unknown id |
| `GET /api/releases/:id`    | `requireAuthenticatedApiUser` | —                                              | `ReleaseDetail`             | 400 bad id, 404                        |

Zod for the read body:

```ts
export const markReleaseReadRequestSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ releaseId: z.number().int().positive() }),
]);
```

### Admin-facing (superUser)

| Method + path                         | Guard                                             | Request                                            | Response                                                                                        | Errors                                                         |
| ------------------------------------- | ------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /api/admin/releases/recipients`  | `requireApiAdminPermission({release:["manage"]})` | —                                                  | `{ recipients: ReleaseRecipient[], mailConfigured: boolean }`                                   | 401/403                                                        |
| `POST /api/admin/releases/:id/notify` | same                                              | `{ userIds: string[] }` (1–1000 ids)               | `{ releaseId, sent, failed: {userId,email,error}[], skipped }` (200 even with partial failures) | 400, 404 release, **503 when SMTP is not configured**, 401/403 |
| `POST /api/admin/releases/format`     | same                                              | `{ title?: string, body: string }` (body 1–50 000) | `{ text: string }`                                                                              | 400, 502 model failure, 401/403                                |

```ts
export type ReleaseRecipient = {
  id: string;
  name: string | null;
  email: string;
};
export const notifyReleaseRequestSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(1000),
});
```

### Form actions on `/admin/features` (superforms)

| Action            | Schema                  | superforms id    | Behaviour                                                                                  |
| ----------------- | ----------------------- | ---------------- | ------------------------------------------------------------------------------------------ |
| `?/createRelease` | `releaseFormSchema`     | `create-release` | `createRelease({ ...form.data, version: getAppBuildVersion(), createdByUserId: user.id })` |
| `?/updateRelease` | `editReleaseFormSchema` | `edit-release`   | `updateRelease(form.data)`; title/body only                                                |

Both return `message<ReleaseActionMessage>(form, { type: "success" | "error", text })`. Note the two forms carry different superforms ids because both dialogs are mounted on the same page at the same time.

```ts
export const releaseFormSchema = z.object({
  title: z.string().trim().min(1, "Give the release a title.").max(200, "…"),
  body: z
    .string()
    .trim()
    .min(1, "Describe what changed (markdown is supported).")
    .max(50_000, "…"),
});
// Edit: same fields plus the row id, coerced because FormData posts strings.
export const editReleaseFormSchema = releaseFormSchema.extend({
  id: z.coerce.number().int().positive(),
});
```

The adapter is `zod4` server-side and `zod4Client` client-side.

### Root layout payload

`src/routes/+layout.server.ts`:

```ts
event.depends(RELEASES_DEPENDENCY); // "app:releases"
// …
let releaseInbox: ReleaseInbox = EMPTY_RELEASE_INBOX;
try {
  releaseInbox = await getReleaseInboxForUser(event.locals.user.id);
} catch (error) {
  console.error("[releases] failed to load inbox for layout:", error);
}
return { user, …, releaseInbox };
```

Two things to copy exactly: the `depends` key so the client can `invalidate("app:releases")` instead of `invalidateAll()`, and the try/catch so a missing migration degrades to "no releases" instead of breaking every page.

---

## 7. SSE notifications

### Server: `GET /api/releases/stream`

Frame format (`event:` name + JSON `data:`):

```
event: latest
data: {"latestReleaseId":42}

event: published
data: {"type":"published","publishedByUserId":"usr_…","release":{"id":43,"version":"20261030-3ebf03d","title":"…","createdAt":"…","createdByName":"…"}}

: ping
```

- The **first frame is always `latest`** with the newest release id (or `null`). A client that reconnects after a drop compares it with what it last knew and can announce a release whose `published` frame it missed.
- `published` frames carry the `ReleasePublishedEvent`, validated client-side with `releasePublishedEventSchema`.
- A comment heartbeat `: ping` every 15 s keeps proxies from idling the connection out.
- Headers: `content-type: text/event-stream`, `cache-control: no-cache`, `connection: keep-alive`, `x-accel-buffering: no` (the last one disables nginx response buffering).
- Cleanup is attached to `event.request.signal` (`abort`) **and** the stream's `cancel()`; both paths funnel through one idempotent `cleanup` closure that unsubscribes, clears the interval and closes the controller.

Core of the handler:

```ts
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    let closed = false;
    const safeEnqueue = (chunk: Uint8Array) => {
      if (closed) return;
      try {
        controller.enqueue(chunk);
      } catch {
        /* client gone */
      }
    };
    const unsubscribe = subscribeToReleaseEvents((published) => {
      safeEnqueue(frame("published", published));
    });
    const heartbeat = setInterval(
      () => safeEnqueue(encoder.encode(": ping\n\n")),
      HEARTBEAT_MS,
    );
    cleanup = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      clearInterval(heartbeat);
      event.request.signal.removeEventListener("abort", cleanup);
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    };
    event.request.signal.addEventListener("abort", cleanup);
    safeEnqueue(frame("latest", { latestReleaseId }));
  },
  cancel() {
    cleanup();
  },
});
```

### Server: the pub/sub hub (`release-events.server.ts`)

A `Set` of subscriber callbacks anchored on `globalThis` so Vite HMR does not create a second hub the open streams cannot see:

```ts
const globalForReleaseEvents = globalThis as unknown as {
  releaseEventHub?: { subscribers: Set<ReleaseSubscriber> };
};
function hub() {
  return (globalForReleaseEvents.releaseEventHub ??= {
    subscribers: new Set(),
  });
}
export function subscribeToReleaseEvents(subscriber) {
  hub().subscribers.add(subscriber);
  return () => hub().subscribers.delete(subscriber);
}
export function publishReleaseEvent(event) {
  for (const subscriber of hub().subscribers) {
    try {
      subscriber(event);
    } catch (error) {
      console.error("[releases] subscriber failed:", error);
    }
  }
}
```

`createRelease` calls `publishReleaseEvent` **after** the transaction commits.

> **Single-instance assumption.** Subscribers live in one Node process. If you run more than one replica, a publish on replica A never reaches streams held by replica B. The upgrade path is Postgres `LISTEN/NOTIFY` (the DB is already shared): `NOTIFY release_published, '<json>'` in `createRelease`, one `LISTEN` connection per replica that fans into the local hub. Do this before scaling horizontally.

> **Run adapter-node under Node, not Bun.** Our Dockerfile installs `nodejs` in the runner and starts with `node build/index.js` because Bun's `node:http` shim tears down streamed responses abruptly, which reverse proxies surface to browsers as `ERR_HTTP2_PROTOCOL_ERROR`. Bun is fine for `bun install` / `bun run build`.

### Client: one `EventSource` per browser (`src/lib/state/release-events.svelte.ts`)

Problem being solved: browsers cap HTTP/1.1 at about six concurrent connections per origin **across all tabs**. A long-lived SSE connection per tab plus other long-polls (we also have a presence reporter) exhausts that quickly. So only one tab per browser holds the stream and relays to the rest.

Mechanism:

1. **Leader election with Web Locks.** Every tab calls `navigator.locks.request("release-events-leader", { mode: "exclusive" }, cb)`. The callback returns a promise that **never resolves** while the tab lives; the tab that gets the lock opens the `EventSource`. When that tab closes, the browser releases the lock and grants it to the next queued tab, which opens its own stream.
2. **Fan-out with `BroadcastChannel("release-events")`.** The leader posts every `published` event; the others handle it as if it came from the stream. `postMessage` is not delivered to the posting tab, so the leader also handles each event locally.
3. **Terminal errors.** `EventSource.onerror` with `readyState === CLOSED` means a non-200 response (401 after session expiry). The store closes the source, **releases the lock** so a still-authenticated tab can lead, and retries after 30 s.
4. **Missed publishes.** On every (re)connect the `latest` frame arrives. If the store already knew a latest id and the new one is greater, it announces from the id alone.
5. **Fallback.** Without Web Locks (very old browsers) each tab opens its own stream.

Verbatim leader election and error handling:

```ts
async #requestLeadership(): Promise<void> {
  if (!this.#active) return;
  await navigator.locks.request(RELEASE_EVENT_LOCK, { mode: "exclusive" }, () =>
    new Promise<void>((release) => {
      if (!this.#active) { release(); return; }
      this.#releaseLock = release;
      this.#connect();
    }),
  );
}

source.onerror = () => {
  // Transient drops auto-reconnect (readyState CONNECTING). A non-200
  // response — 401 once the session expired — closes the source for good:
  // release the lock so another tab can lead, and try again later.
  if (source.readyState !== EventSource.CLOSED) return;
  this.#close();
  this.#giveUpLeadership();
  if (this.#active && !this.#retry) {
    this.#retry = setTimeout(() => { /* re-request leadership or reconnect */ }, RELEASE_RETRY_MS);
  }
};
```

What happens when an event is handled:

```ts
#noticeRelease(releaseId: number, announce: boolean): void {
  if (this.liveReleaseIds.includes(releaseId)) return;
  void invalidate(RELEASES_DEPENDENCY);   // refresh header list / unread count, no reload
  if (!announce) return;                   // the author's own tabs only refresh
  this.liveReleaseIds = [...this.liveReleaseIds, releaseId];
  toast.info("There's new features available, click here to refresh the page", {
    id: TOAST_ID, duration: Infinity, closeButton: true,
    action: { label: "Refresh", onClick: () => location.reload() },
  });
}
```

`announce` is `event.publishedByUserId !== this.#userId`, so the publisher's tabs refresh silently. `liveReleaseIds` is `$state` and lets the bell dot light up immediately, before the layout invalidation round-trips.

Lifecycle hook in `src/routes/+layout.svelte` (keyed on the user **id**, a primitive, so a re-run of the root load returning a fresh `user` object does not churn the connection):

```svelte
$effect(() => {
  if (!presenceUserId) return;
  releaseEvents.init(presenceUserId);
  return () => releaseEvents.destroy();
});
```

`destroy()` closes the source, releases the lock, clears the retry timer and the channel. It runs on sign-out so the lock passes to another tab.

---

## 8. User-facing UI

### Header bell (`top-nav.svelte` → `release-menu.svelte`)

`top-nav.svelte` simply mounts `<ReleaseMenu />` in its right-hand button group. `ReleaseMenu`:

- Reads `page.data.releaseInbox` (typed `ReleaseInbox`, default `EMPTY_RELEASE_INBOX`).
- `unreadCount = inbox.unreadCount + liveUnread`, where `liveUnread` counts ids in `releaseEvents.liveReleaseIds` that the layout has not re-fetched yet.
- Trigger is a shadcn `Popover.Trigger` styled with `buttonVariants({ variant: "ghost", size: "icon" })`, a lucide `BellIcon`, and an absolutely positioned 8 px dot (`bg-primary ring-background ring-2`) when `unreadCount > 0`. `aria-label` is "Release notes, N unread".
- `Popover.Content` (`w-80 p-0`, `align="end"`): header line ("No releases published yet." / "N unread releases" / "You're up to date."), then a `max-h-80 overflow-y-auto` list. Each row: dot (`bg-primary` when unread, transparent when read), title (`font-semibold` when unread), version `Badge` in mono, short date.
- Clicking a row: close the popover, open `ReleaseDialog` with the cached detail or a skeleton, fetch `GET /api/releases/:id` if needed and cache it in a `Map`, and if the item was unread `POST /api/releases/read { releaseId }` then `invalidate("app:releases")`.

### Shared `release-dialog.svelte`

One component for every place a release is read (announcement, bell menu, admin View). Props: `release: ReleaseDetail | null`, `open` (bindable), `loading`, `dismissLabel` (default "Close"), `onDismiss`. The dialog shows title, version badge, "Published {date} by {name}", then `<ReleaseMarkdown body />`, or three `Skeleton` lines while loading.

`onDismiss` fires **once** whenever the dialog closes by any path (button, X, Escape, overlay click), implemented with a `wasOpen` latch inside a `$effect` and `untrack` around the callback.

### Announcement dialog (`release-announcement-dialog.svelte`)

```ts
const release = untrack(
  () =>
    (page.data.releaseInbox as ReleaseInbox | undefined)?.newestUnread ?? null,
);
let open = $state(false);
onMount(() => {
  if (release) open = true;
});
```

Two deliberate choices:

- **`untrack` captures `newestUnread` once at component init.** Later layout refreshes (the SSE `invalidate` after a publish) must not pop the dialog mid-session; the toast + Refresh covers that, and the next full load shows the dialog.
- **Opened in `onMount`**, so the markdown is never server-rendered (see `ReleaseMarkdown`, which renders an empty string on the server anyway).

Dismiss posts `{ all: true }` (best effort, errors swallowed) then `invalidate("app:releases")`.

### Markdown renderer (`release-markdown.svelte` + `ai-chat/markdown.ts`)

```ts
marked.setOptions({ gfm: true, breaks: true });
export function renderMarkdown(text: string): string {
  if (!browser)
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const html = marked.parse(text, { async: false });
  return DOMPurify.sanitize(html);
}
```

```svelte
const html = $derived(browser ? renderMarkdown(body) : "");
<div class="prose prose-sm dark:prose-invert max-w-none {className}">
  {@html html}
</div>
```

DOMPurify needs a DOM, so sanitising only happens in the browser; the server renders nothing and the client fills it in, avoiding a flash of escaped markdown on hydration. Styling comes from `@tailwindcss/typography` (`@plugin "@tailwindcss/typography";` in `app.css`). Dependencies: `marked` 18, `dompurify` 3.

---

## 9. Admin UI (`/admin/features`)

### Page (`+page.svelte`)

- Header: "Release notes" title, explanatory copy, and `Current build <Badge class="font-mono">{data.buildVersion}</Badge>`.
- "New release" button → create dialog.
- A `Card` with `ReleasesTable` (count in the description).
- Four dialogs mounted once each: `ReleaseFormDialog mode="create"`, `ReleaseFormDialog mode="edit"`, `ReleaseDialog` (View), `NotifyUsersDialog`.
- A `Map<number, ReleaseDetail>` cache; rows carry no body, so View/Edit fetch `GET /api/releases/:id` once per release. A successful edit deletes that id from the cache.
- Action results arrive via `onResult(message)`: success closes the dialog and `toast.success`; error `toast.error`.

### Table (`releases-table.svelte`)

Columns: Version (mono badge) · Title (truncated, `title` attr) · Published by · Published (`toLocaleDateString`) · Read by (right-aligned count) · actions **View** / **Edit** (pencil) / **Notify users** (mail). Empty state row spans six columns.

### Form dialog (`release-form-dialog.svelte`)

Props: `form` (SuperValidated), `mode: "create" | "edit"`, `version` (display-only), `values` (row being edited), `open` (bindable), `onResult`.

Key implementation points, in order of how likely they are to bite you:

1. **One dialog instance per mode, mounted simultaneously**, so the two `superForm`s need distinct ids (`create-release`, `edit-release`) matching the server's `superValidate(..., { id })`. The schema and id are read inside `untrack` because `mode` never changes after mount.
2. **Reset on open instead of `{#key}` remount.** A `$effect` on `open` calls `reset()` for create, or copies `values` into `$form` and clears `$errors` for edit. Remounting would briefly give two superForm instances the same id.
3. `superForm` options: `applyAction: true`, `invalidateAll: true`, `resetForm: mode === "create"`, `validators: zod4Client(schema)`, and `onUpdated` forwards `updated.message` to `onResult`.
4. The **Version** field is an `<Input readonly class="font-mono">` with **no `name`**, so it is never posted. Create shows the current build; edit shows the release's own stamped version with the hint "cannot be changed".
5. Edit posts the id via `<input type="hidden" name="id">`.
6. Submit label "Save & publish" (create) or "Save changes" (edit); disabled while submitting or formatting.

### Textarea + live preview + scroll follow

Markup shape:

```svelte
<div class="grid gap-4 lg:grid-cols-2">
  <div class="space-y-2">
    <div class="flex h-7 items-center justify-between gap-3">
      <Label for="{formId}-body">Release notes (markdown)</Label>
      <Button type="button" variant="ghost" size="sm" … onclick={formatBody}
        >AI</Button
      >
    </div>
    <Textarea
      id="{formId}-body"
      name="body"
      class="h-96 resize-none overflow-y-auto font-mono text-sm"
      bind:value={$form.body}
      onscroll={syncPreviewScroll}
    />
  </div>
  <div class="space-y-2">
    <div class="flex h-7 items-center">
      <span class="text-sm leading-none font-medium">Preview</span>
    </div>
    <div
      class="border-input h-96 overflow-y-auto rounded-md border px-4 py-3"
      aria-live="polite"
      bind:this={previewEl}
    >
      {#if bodyEmpty}
        <p class="text-muted-foreground text-sm">Nothing to preview yet.</p>
      {:else}
        <ReleaseMarkdown body={$form.body} />
      {/if}
    </div>
  </div>
</div>
```

- **Live rendering** is free: `ReleaseMarkdown` receives `$form.body`, its `$derived` re-runs `renderMarkdown` on every keystroke. No debounce was needed at 50 000 characters.
- Both panes are a fixed `h-96` with their own scrollbars (`resize-none` on the textarea keeps the heights equal).
- **Scroll follow** is one-way (textarea drives preview) and maps by **scroll fraction**, because rendered markdown is never the same height as its source:

```ts
let previewEl = $state<HTMLDivElement | null>(null);

function syncPreviewScroll(event: Event) {
  const source = event.currentTarget as HTMLTextAreaElement;
  const target = previewEl;
  if (!target) return;
  const sourceRange = source.scrollHeight - source.clientHeight;
  const targetRange = target.scrollHeight - target.clientHeight;
  if (sourceRange <= 0 || targetRange <= 0) {
    target.scrollTop = 0;
    return;
  }
  target.scrollTop = (source.scrollTop / sourceRange) * targetRange;
}
```

The `h-7` header rows above each pane exist so the two panes start on the same y even though only the left one has a button.

### "AI" format button (optional for the port)

`formatBody()` posts `{ title: $form.title, body: previous }` to `POST /api/admin/releases/format`, replaces `$form.body` with the response and shows `toast.success("Notes formatted.", { action: { label: "Undo", onClick: () => ($form.body = previous) } })`. Textarea is disabled while formatting.

Server side (`release-format.server.ts`) uses a Mastra `Agent` cached on `globalThis` with model `RELEASE_FORMAT_MODEL` (default `openai/gpt-4o-mini`, uses `OPENAI_API_KEY`). The system prompt is a **format-only contract**: fix markdown, add `##` sections and bullets where the content supports it, bold feature names, inline code for identifiers, and explicitly _do not_ add, remove, reorder or reword content, and output no code fence. `cleanMarkdown` strips a whole-answer code fence and LF-normalises. Empty output throws → 502.

If your system has no LLM gateway, drop the button and this route; nothing else depends on them.

### Notify users dialog (`notify-users-dialog.svelte`)

- 90 % viewport wide (`w-[90vw] max-w-[90vw] sm:max-w-[90vw]`), `max-h-[90vh]`, flex column so the table scrolls inside.
- On every open: `selected.clear()` and re-fetch `GET /api/admin/releases/recipients`. **Nothing is pre-selected**, so a send is always a deliberate act.
- Selection is a `SvelteSet<string>` (from `svelte/reactivity`) so `$derived` values track it. Header checkbox: `checked={allSelected}` and `indeterminate={partiallySelected}`. Rows toggle on click; the checkbox is `pointer-events-none` inside a `<button>` so the row and the box do not double-toggle.
- `mailConfigured === false` shows a destructive `Alert` ("Set SMTP_HOST and NOTIFICATIONS_FROM_EMAIL…") and disables Notify.
- On `POST …/notify`: all succeeded → success toast and close; partial failure → warning toast naming up to three emails, and **only the failed ids are left ticked** so a retry targets exactly them.

---

## 10. Build number: runtime resolution

`src/lib/server/env.ts`:

```ts
export function getAppBuildVersion(): string {
  const fromEnv = readEnv("APP_BUILD_VERSION")?.trim();
  if (fromEnv) return fromEnv;
  if (globalForEnv.appBuildVersionFile === undefined) {
    const path = join(process.cwd(), "BUILD_VERSION");
    globalForEnv.appBuildVersionFile = existsSync(path)
      ? readFileSync(path, "utf8").trim() || null
      : null;
  }
  return globalForEnv.appBuildVersionFile || "dev";
}
```

Precedence: `APP_BUILD_VERSION` env → `./BUILD_VERSION` file in the working directory → `"dev"`. The file read is cached on `globalThis`.

The format comes from `src/lib/services/releases/release-version.ts`:

```ts
export const DEV_BUILD_VERSION = "dev";
export function formatBuildVersion(date: Date, sha: string): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const short = sha.trim().slice(0, 7) || "nogit";
  return `${year}${month}${day}-${short}`;
}
```

UTC on purpose, so two people building the same commit on the same calendar day get the same identifier. `nogit` appears when the build host has no git metadata.

The version is read **server-side at publish time** in the `createRelease` action and stored on the row. It is shown read-only in the form and can never be edited afterwards.

---

## 11. Build number: Docker changes required

Goal: a plain `docker compose up -d --build` stamps the version with nothing configured on the host, and no git binary inside the builder image.

### `.dockerignore`

```
.git
# Only what scripts/build-version.ts needs to stamp YYYYMMDD-<sha7> into the image.
!.git/HEAD
!.git/packed-refs
!.git/refs/heads/
```

`.git` stays excluded (objects, hooks, config never enter the context), but the three paths the script reads are re-included with `!` exceptions. Verified in an isolated build that only `HEAD` and `refs/heads` land in the image.

### `Dockerfile` (relevant lines)

Builder stage:

```dockerfile
FROM base AS builder
WORKDIR /app
COPY --from=install /temp/dev/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
# Release-notes build identifier. Computed from the copied .git/HEAD (see
# .dockerignore exceptions) plus the build date, so a plain
# `docker compose up -d --build` stamps it. An explicit --build-arg wins.
ARG APP_BUILD_VERSION=
RUN APP_BUILD_VERSION="$APP_BUILD_VERSION" bun scripts/build-version.ts > BUILD_VERSION && cat BUILD_VERSION
RUN bun run build
```

Runner stage:

```dockerfile
FROM base AS runner
WORKDIR /app
# Build identifier shown on /admin/features and stamped onto release notes:
# getAppBuildVersion() reads APP_BUILD_VERSION when set, else ./BUILD_VERSION
# written by the builder stage, else "dev".
COPY --from=builder /app/BUILD_VERSION ./BUILD_VERSION
…
CMD ["node", "build/index.js"]
```

`WORKDIR /app` is also `process.cwd()` at runtime, which is where `getAppBuildVersion()` looks for the file.

### `docker-compose.yml`

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        # Optional override; left empty the Dockerfile computes YYYYMMDD-<sha7> from .git/HEAD.
        # Never put APP_BUILD_VERSION in .env (env_file would override the baked value).
        APP_BUILD_VERSION: ${APP_BUILD_VERSION:-}
    env_file:
      - .env
```

### `scripts/build-version.ts`

Reads git state without the git binary. Handles: `HEAD` as a detached sha; `HEAD` as `ref: refs/heads/x` resolved from a loose ref file, falling back to `packed-refs`; a worktree checkout where `.git` is a `gitdir:` pointer file and refs live in the `commondir`. Honours `APP_BUILD_VERSION` as an override.

```ts
export function readHeadSha(repoRoot: string): string {
  const gitDir = resolveGitDir(repoRoot);
  if (!gitDir) return "";
  const head = readText(join(gitDir, "HEAD"))?.trim();
  if (!head) return "";
  if (/^[0-9a-f]{40}$/i.test(head)) return head; // detached HEAD
  const ref = head.match(/^ref:\s*(.+)$/)?.[1]?.trim();
  if (!ref) return "";
  return readRef(resolveCommonDir(gitDir), ref) ?? "";
}

export function computeBuildVersion(
  repoRoot: string,
  now = new Date(),
): string {
  const override = process.env.APP_BUILD_VERSION?.trim();
  if (override) return override;
  return formatBuildVersion(now, readHeadSha(repoRoot));
}

if (import.meta.main) {
  process.stdout.write(`${computeBuildVersion(dirname(import.meta.dir))}\n`);
}
```

`readRef` tries the loose file first, then scans `packed-refs` lines for `<sha> <ref>`.

### Optional helper `scripts/docker-build.ts` (`bun run docker:build`)

Computes the version on the host and runs `docker compose build` with `APP_BUILD_VERSION` in the environment. Only needed when the build context has no `.git` (an exported tarball) or you want `--dry-run` to print the version.

### Gotchas (all hit in practice)

- **Never put `APP_BUILD_VERSION` in `.env`.** Compose `env_file` injects it at runtime and `getAppBuildVersion()` prefers the env var, so a stale value in `.env` silently overrides the freshly baked file. Our `.env.example` keeps it commented out.
- **Building from a tarball** (CI artefact without `.git`) yields `…-nogit` unless you pass `--build-arg APP_BUILD_VERSION=…`.
- **Docker never reads `.gitignore`.** Only `.dockerignore` decides what enters the build context, so the three `!.git/…` exceptions are the whole mechanism; forgetting one of them (typically `packed-refs` after a `git gc`) yields `nogit`.
- **Env precedence is inconsistent in our codebase.** `env.ts#readEnv` lets the `.env` _file_ win over `process.env`; `notifications-env.ts#readEnv` lets `process.env` win over the file. In both, an empty string masks the lower-priority value. Pick one rule when porting; the Docker runtime path only uses `process.env` so it is unaffected.

---

## 12. Email notifications

### Gate

```ts
/** Whether outbound mail can be sent at all: an SMTP host and a sender. */
export function hasMailTransport(): boolean {
  const config = getNotificationsEnv();
  return Boolean(config.SMTP_HOST && config.NOTIFICATIONS_FROM_EMAIL);
}
```

Used by both admin endpoints: `recipients` returns `mailConfigured`, `notify` returns 503 when false. Do **not** reuse a gate that also requires other subsystems (our digest gate also needs the scraper DB, which release emails do not).

### Transport (`mailer.server.ts`)

nodemailer 8. The `Transporter` is cached on `globalThis` keyed by `JSON.stringify({ host, port, secure, user })`, so one connection pool is reused across requests and HMR reloads and rebuilt if config changes. Credentials are attached only when `SMTP_USER` is set (internal relays often trust the host).

```ts
export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}
export async function sendEmail(email: OutboundEmail): Promise<void> {
  const config = getNotificationsEnv();
  if (!config.NOTIFICATIONS_FROM_EMAIL)
    throw new Error(
      "Missing required environment variable: NOTIFICATIONS_FROM_EMAIL",
    );
  await getTransporter().sendMail({
    from: config.NOTIFICATIONS_FROM_EMAIL,
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}
```

### Env vars

| Variable                      | Default | Notes                                                        |
| ----------------------------- | ------- | ------------------------------------------------------------ |
| `SMTP_HOST`                   | —       | Required for mail.                                           |
| `SMTP_PORT`                   | `587`   | Positive int.                                                |
| `SMTP_USER` / `SMTP_PASSWORD` | —       | Optional; auth only when user is set.                        |
| `SMTP_SECURE`                 | `false` | `1/true/yes/on` → implicit TLS (port 465).                   |
| `NOTIFICATIONS_FROM_EMAIL`    | —       | Required; validated as an email.                             |
| `PUBLIC_BASE_URL`             | —       | Footer link; falls back to `ORIGIN`; omitted if neither set. |

Invalid config never crashes the server: the Zod parse falls back to defaults with a console warning.

### Send loop (`release-notify.server.ts`)

- `listReleaseRecipients()`: all users where `banned` is `false` or `null`, ordered by name then email; `name` becomes `null` when blank.
- `notifyUsersOfRelease({ releaseId, userIds })`: loads the release (404 if missing), **de-duplicates and re-resolves the ids server-side** with the same active-user filter (so a stale client list can never mail a banned or deleted account), builds the email once, then sends **one email per recipient, sequentially**, catching per-recipient errors:

```ts
for (const recipient of recipients) {
  try {
    await sendEmail({ to: recipient.email, ...email });
    sent += 1;
  } catch (error) {
    failed.push({
      userId: recipient.id,
      email: recipient.email,
      error: message,
    });
  }
}
return {
  releaseId,
  sent,
  failed,
  skipped: uniqueIds.length - recipients.length,
};
```

No BCC blast on purpose: individual sends give per-recipient delivery status and never leak the recipient list. With up to 1 000 recipients sequential sends are slow but bounded; if you need more, batch with a small concurrency limit rather than BCC.

### Template (`release-email.server.ts`)

Pure function, unit-tested. Subject = release title (fallback "Release notes"). Body = `<h1>` title, a muted meta line `Version {version} · Published {YYYY-MM-DD}`, the markdown rendered to HTML, and a footer "Open Marketing Tools to see what changed." linking to `appUrl` when set.

Email clients ignore stylesheets, so styles are inlined per tag: a dedicated `Marked` instance (gfm, breaks) renders, then a regex rewrites every opening `<h1|h2|…|td|img` to include `style="…"` from a `TAG_STYLES` map. Raw HTML in the markdown (block or inline) is **escaped to visible text** by overriding the renderer's `html` token:

```ts
const emailMarked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html(token) {
      return escapeHtml(token.text);
    },
  },
});
export function renderReleaseMarkdownForEmail(markdown: string): string {
  const html = emailMarked.parse(markdown, { async: false });
  return html.replace(
    STYLED_TAG_PATTERN,
    (_m, tag) => `<${tag} style="${TAG_STYLES[tag]}"`,
  );
}
```

A plain-text alternative is built from title, meta, the raw markdown and the app URL.

> **Hardening note.** The email path does not run DOMPurify, so a `[link](javascript:…)` in the markdown survives into the HTML `href`. The in-app renderer strips it (DOMPurify). Authors are super users only, so this is accepted here; if your authors are less trusted, run the HTML through an allow-list sanitiser (isomorphic-dompurify works server-side) before inlining styles.

### Testing locally

Run Mailpit (`docker run -p 1025:1025 -p 8025:8025 axllent/mailpit`), set `SMTP_HOST=localhost SMTP_PORT=1025 NOTIFICATIONS_FROM_EMAIL=noreply@example.test` **as process environment variables** (remember the precedence note in §11), and read the messages at `http://localhost:8025`.

---

## 13. Other mission-critical notes

- **No delete.** There is no endpoint or UI to delete a release. Deleting a row by hand cascades its `ReleaseRead` rows; the SSE clients are unaffected.
- **Edit is silent by design.** `updateRelease` changes title/body only, emits no SSE event, resets no read rows, keeps the version. Users who already read the note never see the correction unless they reopen it. If your product wants "re-notify on edit", add a flag rather than changing this default.
- **Limits.** Title ≤ 200, body ≤ 50 000 characters, enforced by Zod on both sides and `maxlength` on the inputs.
- **CRLF.** `normalizeReleaseBody` converts `\r\n` and `\r` to `\n` and trims, on create, update and after AI formatting.
- **Connection budget.** The SSE stream shares the browser's ~6 HTTP/1.1 connections per origin with everything else (we also run a presence long-poll). That is the entire reason for the Web Lock design; do not revert to one stream per tab. Over HTTP/2 the limit is much higher, but do not assume your proxy terminates HTTP/2 to the browser.
- **SSR.** Markdown is never rendered on the server (DOMPurify needs a DOM). The announcement dialog opens in `onMount`; `ReleaseMarkdown` returns `""` server-side.
- **Layout cost.** Every page load runs one `Release` query joined with this user's reads, plus at most one body fetch. With hundreds of releases this is fine; with thousands, paginate `items` and keep `unreadCount` as a separate `count`.
- **Hooks gate vs permission.** `/admin/*` is reachable by any admin-class role, but the page itself checks `release: ["manage"]`. Keep both; the hooks gate alone is not enough.
- **Toasts.** `svelte-sonner` with a fixed toast id (`release-published`) so repeated publishes update one toast instead of stacking.
- **Tests (Vitest).** `releases.test.ts` (inbox builder, schemas), `release-version.test.ts` (format, UTC, nogit), `release-events.server.test.ts` (hub fan-out, throwing subscriber), `release-email.server.test.ts` (inline styles, HTML escaping, footer, text alt), `release-format.server.test.ts` (prompt contract, fence stripping, env model), `routes/api/admin/releases/format/server.test.ts` (guard before body read, 400/502 mapping). Port them with the code; they encode the invariants above.

### Local E2E recipe that does not touch a shared DB

1. `docker run -d -p 55432:5432 -e POSTGRES_PASSWORD=pg postgres:16`
2. `DATABASE_URL=postgresql://postgres:pg@localhost:55432/postgres bunx prisma migrate deploy`
3. Create an admin user and grant `superUser` (we have `scripts/create-admin.ts` and `scripts/grant-roles.ts --set superUser`).
4. Start the dev server with `DATABASE_URL` overridden in the process environment.
5. Open two tabs; in DevTools run `await navigator.locks.query()` to see one `held` and one `pending` client for `release-events-leader`. Publish from a third session; both tabs toast. Close the leader; the other tab becomes `held`.
6. For email, add Mailpit as in §12.

---

## 14. Porting checklist (in dependency order)

1. **Schema**: add `Release`, `ReleaseRead` and the two `user` back-relations; generate a migration; apply with `migrate deploy`.
2. **Permissions**: add `release: ["manage"]` to the access-control statement and to your super-user role (and nowhere else).
3. **Services**: copy `src/lib/services/releases/` (skip `release-format.server.ts` if you have no LLM gateway).
4. **Server infra**: `getAppBuildVersion()`, `getPublicBaseUrl()`, `hasMailTransport()`, `sendEmail()`; API guards `requireAuthenticatedApiUser` / `requireApiAdminPermission` / `requirePermission`.
5. **API routes**: the six `+server.ts` files; confirm `/api/*` is excluded from your login redirect and returns 401, not 302.
6. **Root layout**: `event.depends("app:releases")`, `releaseInbox` in the load with try/catch; `+layout.svelte` effect that inits/destroys `releaseEvents`, mounts `ReleaseAnnouncementDialog`.
7. **Client state**: `src/lib/state/release-events.svelte.ts`.
8. **Components**: `releases/*` (user-facing) and `admin/releases/*`; mount `<ReleaseMenu />` in your header; ensure `@tailwindcss/typography` is loaded; shadcn components needed: `badge`, `button`, `card`, `dialog`, `input`, `label`, `textarea`, `popover`, `table`, `checkbox`, `alert`, `skeleton`, `sonner`. (**Assumed:** your shadcn-svelte generation matches ours; if `shadcn-svelte add` bumps bits-ui and emits `data-active` classes, revert the bump and use `data-[state=active]`.)
9. **Admin route**: `src/routes/admin/features/` and a card on your admin landing page gated by `hasPermission(event, { release: ["manage"] })`.
10. **Docker**: `.dockerignore` exceptions, builder `ARG` + `RUN build-version.ts > BUILD_VERSION`, runner `COPY BUILD_VERSION`, compose build arg; run under Node.
11. **Env**: `SMTP_*`, `NOTIFICATIONS_FROM_EMAIL`, `PUBLIC_BASE_URL`; optionally `RELEASE_FORMAT_MODEL` + `OPENAI_API_KEY`. Keep `APP_BUILD_VERSION` out of `.env`.
12. **Tests**: run the six test files; then the two-tab Web Lock check and a Mailpit send.

---

## Verified vs assumed

- **Verified (read from source on 2026-10-30):** every file path, symbol, route, schema, env var, Dockerfile line and behaviour described above.
- **Assumed:** (a) the migration has been applied to our production database (it had not on 2026-10-29); (b) the receiving team's shadcn-svelte / bits-ui versions are compatible with our component markup.
