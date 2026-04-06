<script lang="ts">
  import { untrack } from "svelte";
  import type { SuperValidated } from "sveltekit-superforms";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { superForm } from "sveltekit-superforms/client";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { formatBrandLabel, type BrandOption } from "$lib/services/brands";
  import {
    createUserFormSchema,
    editUserFormSchema,
    getDefaultCreateUserFormData,
    getDefaultEditUserFormData,
    type CreateUserFormData,
    type EditUserFormData,
    type UserEditorActionMessage,
    userRoleOptions,
  } from "$lib/services/user-editor-form";

  type UserEditorValues = {
    name: string;
    email: string;
    password: string;
    role: "user" | "admin";
    brandIds: string[];
    userId?: string;
  };

  type Props = {
    form: SuperValidated<CreateUserFormData> | SuperValidated<EditUserFormData>;
    mode: "create" | "edit";
    action: string;
    brands: BrandOption[];
    values?: UserEditorValues;
    userId?: string | null;
    onSuccess?: (msg: UserEditorActionMessage) => void;
  };

  let {
    form: initialForm,
    mode,
    action,
    brands,
    values = mode === "create"
      ? getDefaultCreateUserFormData()
      : getDefaultEditUserFormData(),
    userId = null,
    onSuccess,
  }: Props = $props();

  const currentSchema = $derived(
    mode === "create" ? createUserFormSchema : editUserFormSchema,
  );

  // svelte-ignore state_referenced_locally
  const { form, errors, constraints, enhance, submitting } = superForm(
    untrack(() => initialForm),
    {
      applyAction: true,
      invalidateAll: true,
      resetForm: mode === "create",
      id: mode === "create" ? "create-user" : "edit-user",
      validators: zod4Client(currentSchema),
      onUpdated: ({ form }) => {
        if (form.valid && form.message) {
          onSuccess?.(form.message as UserEditorActionMessage);
        }
      },
    },
  );

  $effect(() => {
    const nextValues = values;

    $form.name = nextValues.name;
    $form.email = nextValues.email;
    $form.password = "";
    $form.role = nextValues.role;
    $form.brandIds = [...nextValues.brandIds];

    if (mode === "edit") {
      ($form as EditUserFormData).userId = userId ?? nextValues.userId ?? "";
    }
  });

  const title = $derived(mode === "create" ? "Create user" : "Edit user");
  const description = $derived(
    mode === "create"
      ? "Create a new account with a role and an initial password."
      : "Update account details and optionally replace the current password.",
  );
  const submitLabel = $derived(
    mode === "create" ? "Create User" : "Save Changes",
  );
  const editErrors = $derived(
    $errors as Partial<Record<keyof EditUserFormData, string[]>>,
  );
</script>

<form method="POST" {action} use:enhance class="space-y-5">
  <div class="space-y-1">
    <h3 class="text-lg font-semibold tracking-[-0.02em]">{title}</h3>
    <p class="text-muted-foreground text-sm leading-6">{description}</p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="space-y-2">
      <Label for="user-editor-name">Name</Label>
      <Input
        id="user-editor-name"
        name="name"
        bind:value={$form.name}
        aria-invalid={!!$errors.name}
        {...$constraints.name}
      />
      {#if $errors.name}
        <p class="text-destructive text-sm">{$errors.name}</p>
      {/if}
    </div>

    <div class="space-y-2">
      <Label for="user-editor-email">Email</Label>
      <Input
        id="user-editor-email"
        name="email"
        type="email"
        bind:value={$form.email}
        aria-invalid={!!$errors.email}
        {...$constraints.email}
      />
      {#if $errors.email}
        <p class="text-destructive text-sm">{$errors.email}</p>
      {/if}
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between gap-3">
        <Label for="user-editor-password">Password</Label>
        {#if mode === "edit"}
          <span class="text-muted-foreground text-xs"
            >Leave blank to keep current</span
          >
        {/if}
      </div>
      <Input
        id="user-editor-password"
        name="password"
        type="password"
        bind:value={$form.password}
        aria-invalid={!!$errors.password}
        {...$constraints.password}
      />
      {#if $errors.password}
        <p class="text-destructive text-sm">{$errors.password}</p>
      {/if}
    </div>

    <div class="space-y-2">
      <Label for="user-editor-role">Role</Label>
      <NativeSelect.Root
        id="user-editor-role"
        name="role"
        class="w-full"
        bind:value={$form.role}
        aria-invalid={!!$errors.role}
      >
        {#each userRoleOptions as option}
          <NativeSelect.Option value={option}>{option}</NativeSelect.Option>
        {/each}
      </NativeSelect.Root>
      {#if $errors.role}
        <p class="text-destructive text-sm">{$errors.role}</p>
      {/if}
    </div>

    <div class="space-y-2 sm:col-span-2">
      <div class="flex items-center justify-between gap-3">
        <Label for="user-editor-brand-ids">Brands</Label>
        <span class="text-muted-foreground text-xs">Select one or more</span>
      </div>
      <NativeSelect.Root
        id="user-editor-brand-ids"
        name="brandIds"
        class="min-h-36"
        multiple
        size={Math.max(Math.min(brands.length, 6), 4)}
        bind:value={$form.brandIds}
        aria-invalid={!!$errors.brandIds}
      >
        {#each brands as brand}
          <NativeSelect.Option value={brand.id.toString()}>
            {formatBrandLabel(brand)}
          </NativeSelect.Option>
        {/each}
      </NativeSelect.Root>
      <p class="text-muted-foreground text-xs leading-5">
        Hold Ctrl or Command to select multiple brands.
      </p>
      {#if $errors.brandIds}
        <p class="text-destructive text-sm">{$errors.brandIds}</p>
      {/if}
    </div>
  </div>

  {#if mode === "edit"}
    <input
      type="hidden"
      name="userId"
      value={userId ?? ($form as EditUserFormData).userId}
    />
    {#if editErrors.userId}
      <p class="text-destructive text-sm">{editErrors.userId}</p>
    {/if}
  {/if}

  <div class="flex justify-end">
    <Button type="submit" disabled={$submitting}>
      {$submitting ? "Saving..." : submitLabel}
    </Button>
  </div>
</form>
