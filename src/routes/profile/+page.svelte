<script lang="ts">
  import { superForm } from "sveltekit-superforms";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { untrack } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { profileSchema, passwordSchema } from "./schema.js";
  import { updateUser, changePassword } from "$lib/auth-client.js";
  import { formatBrandLabel } from "$lib/services/brands.js";
  import { getInsecurePasswordSubmissionMessage } from "$lib/services/transport-security";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";

  let { data } = $props();

  const insecurePasswordMessage = $derived(
    getInsecurePasswordSubmissionMessage(),
  );

  let isSavingProfile = $state(false);
  let profileError = $state("");

  let isSavingPassword = $state(false);
  let passwordError = $state("");

  const {
    form: profile,
    errors: profileErrors,
    constraints: profileConstraints,
  } = superForm(
    untrack(() => data.profileForm),
    {
      SPA: true,
      validators: zod4Client(profileSchema),
    },
  );

  const {
    form: password,
    errors: passwordErrors,
    constraints: passwordConstraints,
    reset: resetPassword,
  } = superForm(
    untrack(() => data.passwordForm),
    {
      SPA: true,
      validators: zod4Client(passwordSchema),
    },
  );

  async function handleProfileSubmit(e: SubmitEvent) {
    e.preventDefault();

    const parsed = profileSchema.safeParse({ name: $profile.name });
    if (!parsed.success) {
      return;
    }

    isSavingProfile = true;
    profileError = "";

    try {
      const { error } = await updateUser({ name: parsed.data.name });

      if (error) {
        profileError = error.message ?? "Could not update your details.";
      } else {
        toast.success("Profile updated.");
        await invalidateAll();
      }
    } finally {
      isSavingProfile = false;
    }
  }

  async function handlePasswordSubmit(e: SubmitEvent) {
    e.preventDefault();

    if (insecurePasswordMessage) {
      passwordError = insecurePasswordMessage;
      return;
    }

    const parsed = passwordSchema.safeParse({
      currentPassword: $password.currentPassword,
      newPassword: $password.newPassword,
      confirmPassword: $password.confirmPassword,
    });
    if (!parsed.success) {
      return;
    }

    isSavingPassword = true;
    passwordError = "";

    try {
      const { error } = await changePassword({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      });

      if (error) {
        passwordError = error.message ?? "Could not change your password.";
      } else {
        toast.success("Password changed.");
        resetPassword();
      }
    } finally {
      isSavingPassword = false;
    }
  }
</script>

<svelte:head>
  <title>Profile — Marketing Tools</title>
</svelte:head>

<div class="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
  <div class="space-y-1">
    <h1 class="text-2xl font-semibold tracking-tight">Profile</h1>
    <p class="text-muted-foreground text-sm">
      Manage your account details and password.
    </p>
  </div>

  <Card>
    <CardHeader>
      <CardTitle>Account details</CardTitle>
      <CardDescription>Update your display name.</CardDescription>
    </CardHeader>
    <CardContent>
      <form onsubmit={handleProfileSubmit} class="space-y-4">
        <div class="space-y-1.5">
          <Label for="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={data.user?.email ?? ""}
            readonly
            disabled
          />
          <p class="text-muted-foreground text-xs">
            Your email address cannot be changed here.
          </p>
        </div>

        <div class="space-y-1.5">
          <Label for="name">Name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            autocomplete="name"
            bind:value={$profile.name}
            aria-invalid={!!$profileErrors.name}
            {...$profileConstraints.name}
          />
          {#if $profileErrors.name}
            <p class="text-destructive text-sm">{$profileErrors.name}</p>
          {/if}
        </div>

        {#if profileError}
          <div
            class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {profileError}
          </div>
        {/if}

        <Button type="submit" disabled={isSavingProfile}>
          {isSavingProfile ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Password</CardTitle>
      <CardDescription>
        Choose a new password. Other sessions will be signed out.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form onsubmit={handlePasswordSubmit} class="space-y-4">
        <div class="space-y-1.5">
          <Label for="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autocomplete="current-password"
            bind:value={$password.currentPassword}
            aria-invalid={!!$passwordErrors.currentPassword}
            {...$passwordConstraints.currentPassword}
          />
          {#if $passwordErrors.currentPassword}
            <p class="text-destructive text-sm">
              {$passwordErrors.currentPassword}
            </p>
          {/if}
        </div>

        <div class="space-y-1.5">
          <Label for="newPassword">New password</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autocomplete="new-password"
            bind:value={$password.newPassword}
            aria-invalid={!!$passwordErrors.newPassword}
            {...$passwordConstraints.newPassword}
          />
          {#if $passwordErrors.newPassword}
            <p class="text-destructive text-sm">
              {$passwordErrors.newPassword}
            </p>
          {/if}
        </div>

        <div class="space-y-1.5">
          <Label for="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autocomplete="new-password"
            bind:value={$password.confirmPassword}
            aria-invalid={!!$passwordErrors.confirmPassword}
            {...$passwordConstraints.confirmPassword}
          />
          {#if $passwordErrors.confirmPassword}
            <p class="text-destructive text-sm">
              {$passwordErrors.confirmPassword}
            </p>
          {/if}
        </div>

        {#if insecurePasswordMessage}
          <div
            class="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
          >
            {insecurePasswordMessage}
          </div>
        {/if}

        {#if passwordError}
          <div
            class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
          >
            {passwordError}
          </div>
        {/if}

        <Button
          type="submit"
          disabled={isSavingPassword || !!insecurePasswordMessage}
        >
          {isSavingPassword ? "Changing…" : "Change password"}
        </Button>
      </form>
    </CardContent>
  </Card>

  <Card>
    <CardHeader>
      <CardTitle>Assigned brands</CardTitle>
      <CardDescription>
        Brands you can work with. Contact an administrator to change these.
      </CardDescription>
    </CardHeader>
    <CardContent>
      {#if data.brands.length > 0}
        <div class="flex flex-wrap gap-2">
          {#each data.brands as brand (brand.id)}
            <Badge variant="secondary" class="text-sm">
              {formatBrandLabel(brand)}
            </Badge>
          {/each}
        </div>
      {:else}
        <p class="text-muted-foreground text-sm">
          You have no brands assigned yet.
        </p>
      {/if}
    </CardContent>
  </Card>
</div>
