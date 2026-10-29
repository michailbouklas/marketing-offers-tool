<script lang="ts">
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import type { SuperValidated } from "sveltekit-superforms";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { superForm } from "sveltekit-superforms/client";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import ReleaseMarkdown from "$lib/components/releases/release-markdown.svelte";
  import {
    RELEASE_BODY_MAX_LENGTH,
    RELEASE_TITLE_MAX_LENGTH,
    editReleaseFormSchema,
    releaseFormSchema,
    type EditReleaseFormData,
    type ReleaseActionMessage,
    type ReleaseFormData,
  } from "$lib/services/releases/release-form";
  import { RELEASE_FORMAT_URL } from "$lib/services/releases/releases";

  /**
   * Release form in two modes. "create" publishes immediately: the row is
   * committed, every open stream is notified and other users get the refresh
   * toast. "edit" is a silent correction of title/body — nobody is
   * re-prompted. The version is display-only: the server stamps it from the
   * build env on create and never changes it on edit.
   */
  type Props = {
    form: SuperValidated<ReleaseFormData> | SuperValidated<EditReleaseFormData>;
    mode: "create" | "edit";
    /** Shown read-only: the build version (create) or the release's own (edit). */
    version: string;
    /** Row being edited; ignored in create mode. */
    values?: { id: number; title: string; body: string } | null;
    open?: boolean;
    onResult?: (message: ReleaseActionMessage) => void;
  };

  let {
    form: initialForm,
    mode,
    version,
    values = null,
    open = $bindable(false),
    onResult,
  }: Props = $props();

  // `mode` never changes after mount (the page mounts one dialog per mode).
  const schema = untrack(() =>
    mode === "create" ? releaseFormSchema : editReleaseFormSchema,
  );
  const formId = untrack(() =>
    mode === "create" ? "create-release" : "edit-release",
  );

  // svelte-ignore state_referenced_locally
  const { form, errors, constraints, enhance, submitting, message, reset } =
    superForm(
      untrack(() => initialForm),
      {
        id: formId,
        applyAction: true,
        invalidateAll: true,
        resetForm: mode === "create",
        validators: zod4Client(schema),
        onUpdated: ({ form: updated }) => {
          const result = updated.message as ReleaseActionMessage | undefined;
          if (result) {
            onResult?.(result);
          }
        },
      },
    );

  // Every open starts from the right state: a blank form for create (a
  // cancelled draft must not linger) or a fresh copy of the row for edit.
  // Resetting here instead of remounting with `{#key}` avoids two superForm
  // instances sharing one id during the swap.
  $effect(() => {
    if (!open) return;
    untrack(() => {
      if (mode === "create") {
        reset();
        return;
      }
      $form.title = values?.title ?? "";
      $form.body = values?.body ?? "";
      ($form as EditReleaseFormData).id = values?.id ?? 0;
      $errors.title = undefined;
      $errors.body = undefined;
    });
  });

  const actionError = $derived(
    $message && ($message as ReleaseActionMessage).type === "error"
      ? ($message as ReleaseActionMessage).text
      : null,
  );

  let formatting = $state(false);

  /** Format-only AI pass over the notes; the previous draft stays one Undo away. */
  async function formatBody() {
    const previous = $form.body;
    if (!previous.trim() || formatting || $submitting) return;
    formatting = true;
    try {
      const response = await fetch(RELEASE_FORMAT_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ title: $form.title, body: previous }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? `Format failed (${response.status})`);
      }
      const { text } = (await response.json()) as { text: string };
      $form.body = text;
      toast.success("Notes formatted.", {
        action: {
          label: "Undo",
          onClick: () => {
            $form.body = previous;
          },
        },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not format the notes.",
      );
    } finally {
      formatting = false;
    }
  }

  const bodyEmpty = $derived(!$form.body.trim());

  let previewEl = $state<HTMLDivElement | null>(null);

  /**
   * Keep the preview in step with the textarea. Rendered markdown is never
   * the same height as its source, so map by scroll fraction rather than
   * pixel offset. One-way (source drives preview) to avoid a feedback loop.
   */
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
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
    <Dialog.Header>
      <Dialog.Title>
        {mode === "create" ? "New release" : "Edit release"}
      </Dialog.Title>
      <Dialog.Description>
        {#if mode === "create"}
          Saving publishes the note to every user right away: they see it on
          their next sign-in, and anyone already logged in is prompted to
          refresh.
        {:else}
          Changes are saved quietly: users are not re-notified and read state is
          kept.
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    <form
      method="POST"
      action={mode === "create" ? "?/createRelease" : "?/updateRelease"}
      use:enhance
      class="flex flex-col gap-5"
    >
      {#if mode === "edit"}
        <input type="hidden" name="id" value={values?.id ?? 0} />
      {/if}

      <div class="grid gap-5 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <div class="space-y-2">
          <Label for="{formId}-version">Version</Label>
          <Input
            id="{formId}-version"
            value={version}
            readonly
            class="font-mono"
          />
          <p class="text-muted-foreground text-xs">
            {#if mode === "create"}
              From the Docker build (<code>APP_BUILD_VERSION</code>);
              <Badge variant="outline" class="font-mono">dev</Badge> outside Docker.
            {:else}
              Stamped when the release was published; cannot be changed.
            {/if}
          </p>
        </div>

        <div class="space-y-2">
          <Label for="{formId}-title">Title</Label>
          <Input
            id="{formId}-title"
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
        <div class="grid gap-4 lg:grid-cols-2">
          <div class="space-y-2">
            <div class="flex h-7 items-center justify-between gap-3">
              <Label for="{formId}-body">Release notes (markdown)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="h-7 gap-1 px-2 text-xs"
                disabled={bodyEmpty || formatting || $submitting}
                onclick={formatBody}
                title="Format the markdown with AI"
              >
                {#if formatting}
                  <LoaderCircleIcon class="size-3 animate-spin" />
                {:else}
                  <SparklesIcon class="size-3" />
                {/if}
                AI
              </Button>
            </div>
            <Textarea
              id="{formId}-body"
              name="body"
              placeholder={"## What's new\n\n- …\n\n## Fixes\n\n- …"}
              maxlength={RELEASE_BODY_MAX_LENGTH}
              aria-invalid={$errors.body ? "true" : undefined}
              disabled={formatting}
              class="h-96 resize-none overflow-y-auto font-mono text-sm"
              bind:value={$form.body}
              onscroll={syncPreviewScroll}
              {...$constraints.body}
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
                <p class="text-muted-foreground text-sm">
                  Nothing to preview yet.
                </p>
              {:else}
                <ReleaseMarkdown body={$form.body} />
              {/if}
            </div>
          </div>
        </div>
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
        <Button type="submit" disabled={$submitting || formatting}>
          {#if $submitting}
            <LoaderCircleIcon class="size-4 animate-spin" />
          {/if}
          {mode === "create" ? "Save & publish" : "Save changes"}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
