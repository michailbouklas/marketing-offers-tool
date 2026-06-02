<script lang="ts">
  import { superForm } from "sveltekit-superforms";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { goto } from "$app/navigation";
  import { untrack } from "svelte";
  import { loginSchema } from "./schema.js";
  import { signIn } from "$lib/auth-client.js";
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { getInsecurePasswordSubmissionMessage } from "$lib/services/transport-security";

  let { data } = $props();

  let isLoading = $state(false);
  let authError = $state("");
  const insecurePasswordMessage = $derived(
    getInsecurePasswordSubmissionMessage(),
  );

  const { form, errors, constraints } = superForm(
    untrack(() => data.form),
    {
      SPA: true,
      validators: zod4Client(loginSchema),
    },
  );

  async function handleLogin(e: SubmitEvent) {
    e.preventDefault();

    if (insecurePasswordMessage) {
      authError = insecurePasswordMessage;
      return;
    }

    const parseResult = loginSchema.safeParse({
      email: $form.email,
      password: $form.password,
    });

    if (!parseResult.success) {
      return;
    }

    isLoading = true;
    authError = "";

    try {
      const { error } = await signIn.email({
        email: $form.email as string,
        password: $form.password as string,
      });

      if (error) {
        authError = error.message ?? "Invalid email or password.";
      } else {
        await goto("/", { invalidateAll: true });
      }
    } finally {
      isLoading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign In — Aggregator Offers Tool</title>
</svelte:head>

<Card class="w-full max-w-sm shadow-lg">
  <CardHeader class="space-y-1 text-center">
    <div
      class="bg-primary/10 mx-auto mb-2 flex size-12 items-center justify-center rounded-full"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="text-primary size-6"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </div>
    <CardTitle class="text-2xl font-bold">Sign In</CardTitle>
    <CardDescription>Enter your credentials to access the tool</CardDescription>
  </CardHeader>

  <CardContent>
    <form onsubmit={handleLogin} class="space-y-4">
      <div class="space-y-1.5">
        <Label for="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          autocomplete="email"
          bind:value={$form.email}
          aria-invalid={!!$errors.email}
          {...$constraints.email}
          pattern={undefined}
        />
        {#if $errors.email}
          <p class="text-destructive text-sm">{$errors.email}</p>
        {/if}
      </div>

      <div class="space-y-1.5">
        <Label for="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          autocomplete="current-password"
          bind:value={$form.password}
          aria-invalid={!!$errors.password}
          {...$constraints.password}
        />
        {#if $errors.password}
          <p class="text-destructive text-sm">{$errors.password}</p>
        {/if}
      </div>

      {#if insecurePasswordMessage}
        <div
          class="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {insecurePasswordMessage}
        </div>
      {/if}

      {#if authError}
        <div
          class="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm"
        >
          {authError}
        </div>
      {/if}

      <Button
        type="submit"
        class="w-full"
        disabled={isLoading || !!insecurePasswordMessage}
      >
        {#if isLoading}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="mr-2 size-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Signing in…
        {:else}
          Sign In
        {/if}
      </Button>
    </form>
  </CardContent>

  <CardFooter class="text-muted-foreground justify-center text-xs">
    Access is restricted to authorized personnel only.
  </CardFooter>
</Card>
