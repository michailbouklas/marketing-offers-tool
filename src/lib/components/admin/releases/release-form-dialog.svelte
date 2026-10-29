<script lang="ts">
  import { untrack } from "svelte";
  import type { SuperValidated } from "sveltekit-superforms";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { superForm } from "sveltekit-superforms/client";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import ReleaseMarkdown from "$lib/components/releases/release-markdown.svelte";
  import {
    RELEASE_BODY_MAX_LENGTH,
    RELEASE_TITLE_MAX_LENGTH,
    releaseFormSchema,
    type ReleaseActionMessage,
    type ReleaseFormData,
  } from "$lib/services/releases/release-form";

  /**
   * "New release" dialog. Saving publishes immediately: the row is committed,
   * every open stream is notified and other users get the refresh toast.
   * The version is display-only; the server stamps it from the build env.
   */
  type Props = {
    form: SuperValidated<ReleaseFormData>;
    buildVersion: string;
    open?: boolean;
    onResult?: (message: ReleaseActionMessage) => void;
  };

  let {
    form: initialForm,
    buildVersion,
    open = $bindable(false),
    onResult,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  const { form, errors, constraints, enhance, submitting, message, reset } =
    superForm(
      untrack(() => initialForm),
      {
        id: "create-release",
        applyAction: true,
        invalidateAll: true,
        resetForm: true,
        validators: zod4Client(releaseFormSchema),
        onUpdated: ({ form: updated }) => {
          const result = updated.message as ReleaseActionMessage | undefined;
          if (result) {
            onResult?.(result);
          }
        },
      },
    );

  let tab = $state("write");

  // Start every open from a blank form (a cancelled draft must not linger).
  // Resetting here instead of remounting the dialog with `{#key}` avoids two
  // superForm instances sharing the "create-release" id during the swap.
  $effect(() => {
    if (open) {
      untrack(() => {
        reset();
        tab = "write";
      });
    }
  });

  const actionError = $derived(
    $message && ($message as ReleaseActionMessage).type === "error"
      ? ($message as ReleaseActionMessage).text
      : null,
  );
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title>New release</Dialog.Title>
      <Dialog.Description>
        Saving publishes the note to every user right away: they see it on their
        next sign-in, and anyone already logged in is prompted to refresh.
      </Dialog.Description>
    </Dialog.Header>

    <form
      method="POST"
      action="?/createRelease"
      use:enhance
      class="flex flex-col gap-5"
    >
      <div class="grid gap-5 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <div class="space-y-2">
          <Label for="release-version">Version</Label>
          <Input
            id="release-version"
            value={buildVersion}
            readonly
            class="font-mono"
          />
          <p class="text-muted-foreground text-xs">
            From the Docker build (<code>APP_BUILD_VERSION</code>);
            <Badge variant="outline" class="font-mono">dev</Badge> outside Docker.
          </p>
        </div>

        <div class="space-y-2">
          <Label for="release-title">Title</Label>
          <Input
            id="release-title"
            name="title"
            placeholder="e.g. Sales forecasts and release notes"
            maxlength={RELEASE_TITLE_MAX_LENGTH}
            aria-invalid={$errors.title ? "true" : undefined}
            bind:value={$form.title}
            {...$constraints.title}
          />
          {#if $errors.title}
            <p class="text-destructive text-sm">{$errors.title[0]}</p>
          {/if}
        </div>
      </div>

      <div class="space-y-2">
        <Tabs.Root bind:value={tab}>
          <div class="flex items-center justify-between gap-3">
            <Label for="release-body">Release notes (markdown)</Label>
            <Tabs.List>
              <Tabs.Trigger value="write">Write</Tabs.Trigger>
              <Tabs.Trigger value="preview">Preview</Tabs.Trigger>
            </Tabs.List>
          </div>
          <Tabs.Content value="write" class="pt-2">
            <Textarea
              id="release-body"
              name="body"
              rows={14}
              placeholder={"## What's new\n\n- …\n\n## Fixes\n\n- …"}
              maxlength={RELEASE_BODY_MAX_LENGTH}
              aria-invalid={$errors.body ? "true" : undefined}
              class="min-h-72 font-mono text-sm"
              bind:value={$form.body}
              {...$constraints.body}
            />
          </Tabs.Content>
          <Tabs.Content value="preview" class="pt-2">
            <div class="border-input min-h-72 rounded-md border px-4 py-3">
              {#if $form.body.trim()}
                <ReleaseMarkdown body={$form.body} />
              {:else}
                <p class="text-muted-foreground text-sm">
                  Nothing to preview yet.
                </p>
              {/if}
            </div>
          </Tabs.Content>
        </Tabs.Root>
        {#if $errors.body}
          <p class="text-destructive text-sm">{$errors.body[0]}</p>
        {/if}
      </div>

      {#if actionError}
        <p class="text-destructive text-sm" role="alert">{actionError}</p>
      {/if}

      <Dialog.Footer>
        <Button
          type="button"
          variant="outline"
          onclick={() => (open = false)}
          disabled={$submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={$submitting}>
          {#if $submitting}
            <LoaderCircleIcon class="size-4 animate-spin" />
          {/if}
          Save &amp; publish
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
