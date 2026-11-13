<script lang="ts">
  import { toast } from "svelte-sonner";
  import UserEditorForm from "$lib/components/admin/user-editor-form.svelte";
  import UsersTable from "$lib/components/admin/users-table.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import {
    getDefaultEditUserFormData,
    type UserEditorActionMessage,
  } from "$lib/services/user-editor-form";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { roleLabels, userRoles } from "$lib/auth/roles";
  import { formatBrandLabel } from "$lib/services/brands";
  import {
    getUserStatus,
    summarizeUsers,
    userStatusLabels,
    type UserRecord,
    type UserStatus,
  } from "$lib/services/users";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Page-load time is precise enough for day-granular status buckets.
  const now = new Date();
  let search = $state("");
  let statusFilter = $state<UserStatus | "">("");
  let roleFilter = $state("");
  let brandFilter = $state("");

  const summary = $derived(summarizeUsers(data.users, now));

  const filteredUsers = $derived.by(() => {
    const query = search.trim().toLowerCase();
    return data.users.filter(
      (user) =>
        (!query ||
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)) &&
        (!statusFilter || getUserStatus(user, now) === statusFilter) &&
        (!roleFilter || user.roles.some((role) => role === roleFilter)) &&
        (!brandFilter ||
          user.brands.some((brand) => String(brand.id) === brandFilter)),
    );
  });

  const hasFilters = $derived(
    Boolean(search || statusFilter || roleFilter || brandFilter),
  );

  function clearFilters() {
    search = "";
    statusFilter = "";
    roleFilter = "";
    brandFilter = "";
  }

  let createOpen = $state(false);
  let editOpen = $state(false);
  let editingUser = $state<UserRecord | null>(null);

  const editValues = $derived(
    editingUser
      ? getDefaultEditUserFormData(editingUser)
      : getDefaultEditUserFormData(),
  );

  function handleSuccess(
    message: UserEditorActionMessage,
    mode: "create" | "edit",
  ) {
    if (mode === "create") {
      createOpen = false;
      toast.success("User created.");
      return;
    }

    editOpen = false;
    toast.success("User updated.");
  }

  function openEditUser(user: UserRecord) {
    editingUser = user;
    editOpen = true;
  }
</script>

<svelte:head>
  <title>Users | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Manage application users, roles, and account details from the admin workspace."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[20rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-1)_20%,transparent),transparent_32%),radial-gradient(circle_at_90%_18%,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_28%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section
      class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="space-y-2">
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Users
        </h1>
        <p class="text-muted-foreground max-w-2xl text-base leading-7">
          Create and update internal accounts without leaving the admin
          workspace.
        </p>
      </div>

      <Button onclick={() => (createOpen = true)}>Add User</Button>
    </section>

    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {#each [{ label: "Total accounts", value: summary.total }, { label: "Active last 7 days", value: summary.active7d }, { label: "Active last 30 days", value: summary.active30d }, { label: "Never signed in", value: summary.never }, { label: "Deactivated", value: summary.deactivated }] as stat (stat.label)}
        <Card.Root class="border-border/70">
          <Card.Header>
            <Card.Description>{stat.label}</Card.Description>
            <Card.Title class="text-3xl tabular-nums">{stat.value}</Card.Title>
          </Card.Header>
        </Card.Root>
      {/each}
    </section>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden backdrop-blur"
    >
      <Card.Header>
        <Card.Title class="text-2xl tracking-[-0.03em]">All users</Card.Title>
        <Card.Description>
          Review account ownership, access level, and activity. Filter by
          status, role, or brand to review who has access to what.
        </Card.Description>
      </Card.Header>
      <Card.Content class="space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            placeholder="Search name or email"
            aria-label="Search users"
            class="w-64"
            bind:value={search}
          />
          <NativeSelect.Root aria-label="Status" bind:value={statusFilter}>
            <NativeSelect.Option value="">All statuses</NativeSelect.Option>
            {#each Object.entries(userStatusLabels) as [value, label] (value)}
              <NativeSelect.Option {value}>{label}</NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
          <NativeSelect.Root aria-label="Role" bind:value={roleFilter}>
            <NativeSelect.Option value="">All roles</NativeSelect.Option>
            {#each userRoles as role (role)}
              <NativeSelect.Option value={role}
                >{roleLabels[role]}</NativeSelect.Option
              >
            {/each}
          </NativeSelect.Root>
          <NativeSelect.Root aria-label="Brand" bind:value={brandFilter}>
            <NativeSelect.Option value="">All brands</NativeSelect.Option>
            {#each data.brands as brand (brand.id)}
              <NativeSelect.Option value={String(brand.id)}>
                {formatBrandLabel(brand)}
              </NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
          {#if hasFilters}
            <Button variant="ghost" size="sm" onclick={clearFilters}>
              Clear
            </Button>
            <span class="text-muted-foreground text-sm">
              {filteredUsers.length} of {data.users.length} users
            </span>
          {/if}
        </div>

        <UsersTable
          users={filteredUsers}
          onedituser={openEditUser}
          showHistory={data.isSuperUser}
        />
      </Card.Content>
    </Card.Root>

    <Dialog.Root bind:open={createOpen}>
      <Dialog.Content class="sm:max-w-2xl">
        <Dialog.Header>
          <Dialog.Title>Add User</Dialog.Title>
          <Dialog.Description>Create a new account.</Dialog.Description>
        </Dialog.Header>

        <UserEditorForm
          form={data.createForm}
          mode="create"
          action="?/createUser"
          brands={data.brands}
          onSuccess={(message) => handleSuccess(message, "create")}
        />
      </Dialog.Content>
    </Dialog.Root>

    <Dialog.Root bind:open={editOpen}>
      <Dialog.Content class="sm:max-w-2xl">
        <Dialog.Header>
          <Dialog.Title>Edit User</Dialog.Title>
          <Dialog.Description>Update account details.</Dialog.Description>
        </Dialog.Header>

        <UserEditorForm
          form={data.editForm}
          mode="edit"
          action="?/updateUser"
          brands={data.brands}
          values={editValues}
          userId={editingUser?.id ?? null}
          onSuccess={(message) => handleSuccess(message, "edit")}
        />
      </Dialog.Content>
    </Dialog.Root>
  </main>
</div>
