# Task: Admin Users Management Page (`/admin/users`)

**Status:** `[~] In Progress`  
**Created:** 2026-03-11  
**Route:** `/admin/users`  
**Access:** Admin only

## Overview

Add an admin-only `/admin/users` page that:

- Lists all users in a table
- Has an "Add User" button that opens a dialog to create a new user
- Has an "Edit" button per row that opens the same dialog pre-populated with that user's data
- Edit dialog supports optional password change (blank = keep current)
- No delete user functionality (out of scope)

---

## Progress

| #   | Phase     | Task                                                    | Status |
| --- | --------- | ------------------------------------------------------- | ------ |
| 1   | Auth      | Extend `isAdminPath()` to cover `/admin` routes         | `[x]`  |
| 2   | Service   | Create `user-editor-form.ts` (schemas + mappers)        | `[x]`  |
| 3   | Service   | Create `users.server.ts` (list / create / update)       | `[x]`  |
| 4   | Component | Create `user-editor-form.svelte`                        | `[x]`  |
| 5   | Component | Create `users-table.svelte`                             | `[x]`  |
| 6   | Route     | Create `+page.server.ts` (load + actions)               | `[x]`  |
| 7   | Route     | Create `+page.svelte` (page UI)                         | `[x]`  |
| 8   | Nav       | Create `+layout.server.ts` (expose user to all layouts) | `[x]`  |
| 9   | Nav       | Update `top-nav.svelte` (conditional Admin link)        | `[x]`  |
| 10  | Docs      | Update `AGENTS.md` with new service references          | `[x]`  |

> Update statuses to `[x]` as each task is completed, or `[~]` if in progress.

---

## Detailed Task Breakdown

### Phase 1 — Auth & Route Guards

#### Task 1 — Extend `isAdminPath()`

**File:** `src/lib/server/auth-guards.ts`

- [ ] In `isAdminPath()`, also return `true` for `pathname === "/admin"` and `pathname.startsWith("/admin/")`
- [ ] This ensures `hooks.server.ts` redirects unauthenticated users to `/login` and non-admins to `/` before any load function runs

```ts
// Before
export function isAdminPath(pathname: string) {
  return (
    pathname === "/aggregator-offers" ||
    pathname.startsWith("/aggregator-offers/")
  );
}

// After
export function isAdminPath(pathname: string) {
  return (
    pathname === "/aggregator-offers" ||
    pathname.startsWith("/aggregator-offers/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}
```

---

### Phase 2 — Service Layer

#### Task 2 — Create `src/lib/services/user-editor-form.ts`

- [ ] `createUserFormSchema`: `{ name (min 1), email (email), password (min 8), role (enum "user"|"admin", default "user") }`
- [ ] `editUserFormSchema`: same as create but `password` is optional (blank allowed) + `userId: z.string()` hidden field
- [ ] Export types: `CreateUserFormData`, `EditUserFormData`
- [ ] Export `getDefaultCreateUserFormData()` — returns empty defaults
- [ ] Export `getDefaultEditUserFormData(user)` — maps a user record to edit form defaults (no password pre-fill)
- [ ] Export `UserEditorActionMessage` type: `{ type: "success" | "error", text: string }`

#### Task 3 — Create `src/lib/services/users.server.ts`

- [ ] `listUsers()` — Prisma query on `user` table: select `id, name, email, role, createdAt, banned`, order by `createdAt` desc. Export return type as `UserRecord`.
- [ ] `createUser(data, headers)` — delegate to `auth.api.createUser({ body: { email, name, password, role }, headers })` so Better Auth handles password hashing and `account` row creation
- [ ] `updateUser(id, data)` — Prisma `user.update` with `{ name, email, role }`; if `password` provided, also call Better Auth to rehash

---

### Phase 3 — Components

#### Task 4 — Create `src/lib/components/admin/user-editor-form.svelte`

- [ ] Props (Svelte 5 `$props()`): `form`, `mode: "create" | "edit"`, `action: string`, `values?`, `userId?`, `onSuccess?: (msg: UserEditorActionMessage) => void`
- [ ] Follow same pattern as `offer-editor-form.svelte`: `untrack()` init, `$effect` sync, `superForm` with `zod4Client` validator
- [ ] Form ID: `"create-user"` on create, `"edit-user"` on edit (prevents form state crosstalk)
- [ ] Fields:
  - Name — `<Input>` (required)
  - Email — `<Input type="email">` (required)
  - Password — `<Input type="password">` (required on create; label "Leave blank to keep current" on edit, optional)
  - Role — `<NativeSelect>` with options `user` / `admin`
  - `userId` — `<input type="hidden">` (edit mode only)
- [ ] Display validation errors from `$errors`
- [ ] Call `onSuccess` in `onUpdated` when `form.valid && form.message`

#### Task 5 — Create `src/lib/components/admin/users-table.svelte`

- [ ] Props (Svelte 5): `{ users: UserRecord[], onedituser: (user: UserRecord) => void }`
- [ ] Use shadcn `Table` components: `Table.Root`, `Table.Header`, `Table.Body`, `Table.Row`, `Table.Head`, `Table.Cell`
- [ ] Columns: **Name**, **Email**, **Role** (Badge — `default` for admin, `secondary` for user), **Created At** (formatted `toLocaleDateString`), **Actions** (Edit `Button` → calls `onedituser(user)`)
- [ ] If `users` is empty, show an empty state row with a message

---

### Phase 4 — Route

#### Task 6 — Create `src/routes/admin/users/+page.server.ts`

- [ ] `load`: `await requireAdminUser(event)` guard, then `Promise.all`:
  - `listUsers()`
  - `superValidate(getDefaultCreateUserFormData(), zod4(createUserFormSchema), { errors: false, id: "create-user" })`
  - `superValidate(getDefaultEditUserFormData(), zod4(editUserFormSchema), { errors: false, id: "edit-user" })`
  - Return `{ users, createForm, editForm }`
- [ ] `actions.createUser`:
  - `await requireAdminUser(event)`
  - `superValidate(formData, zod4(createUserFormSchema), { id: "create-user" })`
  - If invalid: `fail(400, { form })`
  - Call `createUser(data, event.request.headers)`
  - Return `message(form, { type: "success", text: "User created." })`
- [ ] `actions.updateUser`:
  - `await requireAdminUser(event)`
  - `superValidate(formData, zod4(editUserFormSchema), { id: "edit-user" })`
  - If invalid: `fail(400, { form })`
  - Call `updateUser(data.userId, data)`
  - Return `message(form, { type: "success", text: "User updated." })`

#### Task 7 — Create `src/routes/admin/users/+page.svelte`

- [ ] `let { data } = $props()`
- [ ] `let createOpen = $state(false)`, `let editOpen = $state(false)`, `let editingUser: UserRecord | null = $state(null)`
- [ ] Page layout:
  - Page header: "Users" `<h1>` + "Add User" `<Button>` on the right → sets `createOpen = true`
  - `<UsersTable users={data.users} onedituser={(user) => { editingUser = user; editOpen = true; }} />`
- [ ] Create Dialog (`Dialog.Root bind:open={createOpen}`):
  - Title: "Add User", Description: "Create a new account."
  - `<UserEditorForm form={data.createForm} mode="create" action="?/createUser" onSuccess={() => { createOpen = false; toast.success("User created."); }}`
- [ ] Edit Dialog (`Dialog.Root bind:open={editOpen}`):
  - Title: "Edit User", Description: "Update account details."
  - `<UserEditorForm form={data.editForm} mode="edit" action="?/updateUser" values={editingUser} userId={editingUser?.id} onSuccess={() => { editOpen = false; toast.success("User updated."); }}`
- [ ] Import and use `toast` from `sonner` for success notifications

---

### Phase 5 — Navigation

#### Task 8 — Create `src/routes/+layout.server.ts`

- [ ] Export `load: LayoutServerLoad` returning `{ user: event.locals.user }`
- [ ] This exposes `page.data.user` (with `role`) to every layout and component in the app

#### Task 9 — Update `src/lib/components/navigation/top-nav.svelte`

- [ ] Read `page.data.user?.role` from `$app/state`
- [ ] Replace static `navigationItems` constant with `$derived` that conditionally appends `{ href: "/admin/users", label: "Admin" }` when `role === "admin"`

```ts
// Before
const navigationItems = [
  { href: "/", label: "Home" },
  { href: "/aggregator-offers", label: "Aggregator Offers" },
] as const;

// After
const user = $derived(page.data.user as { role?: string } | null | undefined);
const navigationItems = $derived([
  { href: "/", label: "Home" },
  { href: "/aggregator-offers", label: "Aggregator Offers" },
  ...(user?.role === "admin" ? [{ href: "/admin/users", label: "Admin" }] : []),
]);
```

---

### Phase 6 — Bookkeeping

#### Task 10 — Update `AGENTS.md`

- [ ] Add to the **Service references** section:
  - `src/lib/services/user-editor-form.ts`: Zod schemas (`createUserFormSchema`, `editUserFormSchema`) and form helper functions for the admin users create/edit form.
  - `src/lib/services/users.server.ts`: Server-only service for listing, creating, and updating users via Prisma and the Better Auth admin API.

---

## Acceptance Criteria

- [ ] Navigating to `/admin/users` as a **non-admin** user → redirected to `/`
- [ ] Navigating to `/admin/users` as **unauthenticated** → redirected to `/login`
- [ ] Admin user sees a full users table at `/admin/users`
- [ ] "Add User" button opens dialog → form submits → user created → dialog closes → success toast shown
- [ ] Edit button per row opens dialog pre-populated with that user's data
- [ ] Edit form submits → user updated → dialog closes → success toast shown
- [ ] Blank password field on edit → existing password is preserved unchanged
- [ ] Role badge: `admin` renders as highlighted, `user` renders as secondary
- [ ] "Admin" nav link is visible to admin users and hidden from regular users

---

## Notes

- **Password hashing:** always delegate to Better Auth (`auth.api.createUser` / `auth.api.changePassword`) — never hash manually.
- **Form IDs:** `"create-user"` and `"edit-user"` must be set on both the server superValidate call and the client `superForm` call to prevent state crosstalk when both forms are on the same page.
- **`svelte-autofixer`:** run after every file change per project conventions.
- **Svelte 5 props:** use `onedituser` naming convention for callback props (no dispatch).
- **TailwindCSS 4:** no `tailwind.config.js`, use CSS variables and utility classes directly.
