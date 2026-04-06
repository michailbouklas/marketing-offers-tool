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
  import type { UserRecord } from "$lib/services/users";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
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

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden backdrop-blur"
    >
      <Card.Header>
        <Card.Title class="text-2xl tracking-[-0.03em]">All users</Card.Title>
        <Card.Description>
          Review account ownership, access level, and creation dates in one
          table.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <UsersTable users={data.users} onedituser={openEditUser} />
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
