<script lang="ts">
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { superForm, type SuperValidated } from "sveltekit-superforms/client";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import {
    REVIEW_CATEGORY_NAME_MAX_LENGTH,
    REVIEW_CATEGORY_SUMMARY_MAX_LENGTH,
    reviewCategoryFormSchema,
    type ReviewCategoryActionMessage,
    type ReviewCategoryFormData,
    type ReviewCategoryRow,
  } from "$lib/services/google-reviews-admin/categories";

  type Props = {
    editForm: SuperValidated<ReviewCategoryFormData>;
    category: ReviewCategoryRow | null;
    open?: boolean;
    onmessage: (message: ReviewCategoryActionMessage) => void;
  };

  let {
    editForm,
    category,
    open = $bindable(false),
    onmessage,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  const { form, errors, enhance, submitting } = superForm(editForm, {
    applyAction: true,
    invalidateAll: true,
    resetForm: false,
    id: "edit-review-category",
    validators: zod4Client(reviewCategoryFormSchema),
    onUpdated: ({ form: updatedForm }) => {
      const message = updatedForm.message as
        | ReviewCategoryActionMessage
        | undefined;

      if (!message) {
        return;
      }

      onmessage(message);

      if (message.type === "success") {
        open = false;
      }
    },
  });

  const numberFormatter = new Intl.NumberFormat("en-GB");

  // Re-seed the form from the row every time the dialog opens so stale edits
  // from a previous row never leak into the next one.
  $effect(() => {
    if (!open || !category) {
      return;
    }

    form.set({
      id: category.id,
      version: category.version,
      category: category.category ?? "",
      summary: category.summary ?? "",
      isActive: category.isActive,
    });
    errors.set({});
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Edit review category</Dialog.Title>
      <Dialog.Description>
        Changes are written to the scraper's source database. Renaming or
        rewriting the summary bumps the version.
      </Dialog.Description>
    </Dialog.Header>

    {#if category}
      <form
        method="POST"
        action="?/updateCategory"
        use:enhance
        class="grid gap-5"
      >
        <input type="hidden" name="id" value={$form.id} />
        <input type="hidden" name="version" value={$form.version} />
        <input
          type="hidden"
          name="isActive"
          value={$form.isActive ? "true" : "false"}
        />

        <div
          class="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs"
        >
          <span>
            ID <span class="text-foreground font-mono">{category.id}</span>
          </span>
          <span>
            Reviews
            <span class="text-foreground tabular-nums">
              {numberFormatter.format(category.reviewCount)}
            </span>
          </span>
          <span>
            Version
            <span class="text-foreground tabular-nums">{category.version}</span>
          </span>
        </div>

        <div class="space-y-2">
          <Label for="review-category-name">Category</Label>
          <Input
            id="review-category-name"
            name="category"
            bind:value={$form.category}
            maxlength={REVIEW_CATEGORY_NAME_MAX_LENGTH}
            aria-invalid={$errors.category ? "true" : undefined}
            autocomplete="off"
          />
          {#if $errors.category}
            <p class="text-destructive text-sm">{$errors.category[0]}</p>
          {/if}
        </div>

        <div class="space-y-2">
          <Label for="review-category-summary">Summary</Label>
          <Textarea
            id="review-category-summary"
            name="summary"
            bind:value={$form.summary}
            rows={8}
            maxlength={REVIEW_CATEGORY_SUMMARY_MAX_LENGTH}
            aria-invalid={$errors.summary ? "true" : undefined}
          />
          {#if $errors.summary}
            <p class="text-destructive text-sm">{$errors.summary[0]}</p>
          {/if}
        </div>

        <div
          class="flex items-center justify-between gap-4 rounded-xl border p-4"
        >
          <div class="space-y-1">
            <p class="text-sm font-medium">Active</p>
            <p class="text-muted-foreground text-xs leading-5">
              Inactive categories are hidden from the Google Reviews analytics
              pages. Only one active category may carry a given name.
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-muted-foreground text-sm">
              {$form.isActive ? "On" : "Off"}
            </span>
            <Switch bind:checked={$form.isActive} />
          </div>
        </div>

        <Dialog.Footer class="gap-2">
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
              Saving...
            {:else}
              Save changes
            {/if}
          </Button>
        </Dialog.Footer>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
