<script lang="ts">
  import { untrack } from "svelte";
  import type { SuperValidated } from "sveltekit-superforms";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { superForm } from "sveltekit-superforms/client";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { formatBrandLabel, type BrandOption } from "$lib/services/brands";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import { getInsecurePasswordSubmissionMessage } from "$lib/services/transport-security";
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
  const { form, errors, constraints, enhance, submitting, message } = superForm(
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
  const actionErrorMessage = $derived(
    $message && ($message as UserEditorActionMessage).type === "error"
      ? ($message as UserEditorActionMessage).text
      : null,
  );
  const insecurePasswordMessage = $derived.by(() => {
    const isPasswordChange =
      mode === "create" || $form.password.trim().length > 0;

    if (!isPasswordChange) {
      return null;
    }

    return getInsecurePasswordSubmissionMessage();
  });

  let brandPickerOpen = $state(false);

  function isBrandSelected(brandId: string): boolean {
    return $form.brandIds.includes(brandId);
  }

  function toggleBrand(brandId: string) {
    $form.brandIds = isBrandSelected(brandId)
      ? $form.brandIds.filter((existing) => existing !== brandId)
      : [...$form.brandIds, brandId];
  }

  function selectAllBrands() {
    $form.brandIds = brands.map((brand) => brand.id.toString());
  }

  function clearBrandSelection() {
    $form.brandIds = [];
  }

  const brandPickerSummary = $derived.by(() => {
    if ($form.brandIds.length === 0) {
      return "Select brands";
    }

    const labels = $form.brandIds.map((brandId) => {
      const brand = brands.find((item) => item.id.toString() === brandId);
      return brand ? formatBrandLabel(brand) : brandId;
    });

    return labels.length <= 2 ? labels.join(", ") : `${labels.length} selected`;
  });

  function handleSubmit(event: SubmitEvent) {
    if (!insecurePasswordMessage) {
      return;
    }

    event.preventDefault();
  }
</script>

<form
  method="POST"
  {action}
  use:enhance
  onsubmit={handleSubmit}
  class="space-y-5"
>
  <div class="space-y-1">
    <h3 class="text-lg font-semibold tracking-[-0.02em]">{title}</h3>
    <p class="text-muted-foreground text-sm leading-6">{description}</p>
  </div>

  {#if actionErrorMessage}
    <div
      class="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm leading-6"
      role="alert"
    >
      {actionErrorMessage}
    </div>
  {/if}

  {#if insecurePasswordMessage}
    <div
      class="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm leading-6"
    >
      {insecurePasswordMessage}
    </div>
  {/if}

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
        pattern={undefined}
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
        <Label id="user-editor-brand-ids-label">Brands</Label>
        <span class="text-muted-foreground text-xs">Select one or more</span>
      </div>
      <Popover.Root bind:open={brandPickerOpen}>
        <Popover.Trigger
          aria-labelledby="user-editor-brand-ids-label"
          aria-invalid={!!$errors.brandIds}
          class={`${buttonVariants({ variant: "outline" })} w-full justify-between font-normal`}
        >
          <span class="truncate">{brandPickerSummary}</span>
          <ChevronsUpDownIcon class="size-4 shrink-0 opacity-60" />
        </Popover.Trigger>

        <Popover.Content
          align="start"
          class="w-[var(--bits-popover-anchor-width)] min-w-[20rem] p-0"
        >
          <div class="flex flex-col">
            <div
              class="flex items-center justify-between gap-2 border-b px-4 py-2"
            >
              <button
                type="button"
                class="text-sm font-medium underline-offset-4 hover:underline"
                onclick={selectAllBrands}
              >
                Select all
              </button>
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground text-sm font-medium underline-offset-4 hover:underline"
                onclick={clearBrandSelection}
              >
                Clear
              </button>
            </div>

            <div class="max-h-80 overflow-y-auto px-2 py-2">
              {#each brands as brand (brand.id)}
                <button
                  type="button"
                  class="hover:bg-accent/50 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
                  onclick={() => toggleBrand(brand.id.toString())}
                >
                  <Checkbox
                    checked={isBrandSelected(brand.id.toString())}
                    class="pointer-events-none"
                  />
                  <div class="min-w-0">
                    <p class="truncate text-sm leading-none font-medium">
                      {formatBrandLabel(brand)}
                    </p>
                  </div>
                </button>
              {/each}
            </div>

            <div
              class="flex items-center justify-between gap-2 border-t px-4 py-3"
            >
              <p class="text-muted-foreground text-xs">
                {$form.brandIds.length} selected
              </p>
              <Button
                type="button"
                size="sm"
                onclick={() => (brandPickerOpen = false)}
              >
                Done
              </Button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Root>
      {#each $form.brandIds as brandId (brandId)}
        <input type="hidden" name="brandIds" value={brandId} />
      {/each}
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
    <Button type="submit" disabled={$submitting || !!insecurePasswordMessage}>
      {$submitting ? "Saving..." : submitLabel}
    </Button>
  </div>
</form>
