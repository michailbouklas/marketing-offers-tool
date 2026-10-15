<script lang="ts">
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { superForm, type SuperValidated } from "sveltekit-superforms/client";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import {
    getDefaultScrapeQueryFormData,
    SCRAPE_QUERY_MAX_LENGTH,
    SCRAPE_QUERY_NOTES_MAX_LENGTH,
    scrapeQueryFormSchema,
    type ScrapeQueryActionMessage,
    type ScrapeQueryBrand,
    type ScrapeQueryFormData,
    type ScrapeQueryRow,
  } from "$lib/services/google-reviews-admin/places";

  type Props = {
    form: SuperValidated<ScrapeQueryFormData>;
    /** `null` opens the dialog in "create" mode. */
    place: ScrapeQueryRow | null;
    brands: ScrapeQueryBrand[];
    open?: boolean;
    onmessage: (message: ScrapeQueryActionMessage) => void;
  };

  let {
    form: formData,
    place,
    brands,
    open = $bindable(false),
    onmessage,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  const { form, errors, enhance, submitting } = superForm(formData, {
    applyAction: true,
    invalidateAll: true,
    resetForm: false,
    id: "scrape-query",
    validators: zod4Client(scrapeQueryFormSchema),
    onUpdated: ({ form: updatedForm }) => {
      const message = updatedForm.message as
        | ScrapeQueryActionMessage
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

  const isEditing = $derived(place !== null);

  const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function formatDateTime(value: string | null) {
    if (!value) {
      return "Never";
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : dateTimeFormatter.format(date);
  }

  // The native select works in strings; the form field is `number | null`.
  function handleBrandChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const parsed = Number.parseInt(value, 10);
    $form.brandId = value && Number.isInteger(parsed) ? parsed : null;
  }

  // Re-seed the form from the row every time the dialog opens so stale edits
  // from a previous row never leak into the next one.
  $effect(() => {
    if (!open) {
      return;
    }

    form.set(
      place
        ? {
            id: place.id,
            query: place.query,
            enabled: place.enabled,
            brandId: place.brandId,
            notes: place.notes ?? "",
          }
        : getDefaultScrapeQueryFormData(),
    );
    errors.set({});
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title>{isEditing ? "Edit place" : "New place"}</Dialog.Title>
      <Dialog.Description>
        The search text is typed into Google Maps as-is. Only enabled places are
        scraped.
      </Dialog.Description>
    </Dialog.Header>

    <form method="POST" action="?/savePlace" use:enhance class="grid gap-5">
      <input type="hidden" name="id" value={$form.id} />
      <input
        type="hidden"
        name="enabled"
        value={$form.enabled ? "true" : "false"}
      />
      <input type="hidden" name="brandId" value={$form.brandId ?? ""} />

      {#if place}
        <div
          class="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs"
        >
          <span>
            ID <span class="text-foreground font-mono">{place.id}</span>
          </span>
          <span>
            Last scraped
            <span class="text-foreground">
              {formatDateTime(place.lastScrapedAt)}
            </span>
          </span>
          <span>
            Updated
            <span class="text-foreground">
              {formatDateTime(place.updatedAt)}
            </span>
          </span>
        </div>
      {/if}

      <div class="space-y-2">
        <Label for="scrape-query-text">Search text</Label>
        <Input
          id="scrape-query-text"
          name="query"
          bind:value={$form.query}
          maxlength={SCRAPE_QUERY_MAX_LENGTH}
          placeholder="Coffee Island cyprus"
          aria-invalid={$errors.query ? "true" : undefined}
          autocomplete="off"
        />
        {#if $errors.query}
          <p class="text-destructive text-sm">{$errors.query[0]}</p>
        {/if}
      </div>

      <div class="space-y-2">
        <Label for="scrape-query-brand">Brand</Label>
        <NativeSelect.Root
          id="scrape-query-brand"
          value={$form.brandId === null ? "" : String($form.brandId)}
          class="w-full"
          onchange={handleBrandChange}
          aria-invalid={$errors.brandId ? "true" : undefined}
        >
          <NativeSelect.Option value="">No brand</NativeSelect.Option>
          {#each brands as brand (brand.remoteId)}
            <NativeSelect.Option value={String(brand.remoteId)}>
              {brand.title}{brand.appBrandId === null ? " (scraper only)" : ""}
            </NativeSelect.Option>
          {/each}
          {#if $form.brandId !== null && !brands.some((brand) => brand.remoteId === $form.brandId)}
            <NativeSelect.Option value={String($form.brandId)}>
              Scraper brand #{$form.brandId}
            </NativeSelect.Option>
          {/if}
        </NativeSelect.Root>
        <p class="text-muted-foreground text-xs">
          Linking a brand also assigns every business this place discovers to
          that brand under Brands, now and after each scrape.
        </p>
        {#if brands.length === 0}
          <p class="text-muted-foreground text-xs">
            The brand list could not be loaded from the scraper API.
          </p>
        {/if}
        {#if $errors.brandId}
          <p class="text-destructive text-sm">{$errors.brandId[0]}</p>
        {/if}
      </div>

      <div class="space-y-2">
        <Label for="scrape-query-notes">Notes</Label>
        <Textarea
          id="scrape-query-notes"
          name="notes"
          bind:value={$form.notes}
          rows={4}
          maxlength={SCRAPE_QUERY_NOTES_MAX_LENGTH}
          placeholder="Chain, all islands"
          aria-invalid={$errors.notes ? "true" : undefined}
        />
        {#if $errors.notes}
          <p class="text-destructive text-sm">{$errors.notes[0]}</p>
        {/if}
      </div>

      <div
        class="flex items-center justify-between gap-4 rounded-xl border p-4"
      >
        <div class="space-y-1">
          <p class="text-sm font-medium">Enabled</p>
          <p class="text-muted-foreground text-xs leading-5">
            Disabled places stay in the list but the scraper skips them.
          </p>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-muted-foreground text-sm">
            {$form.enabled ? "On" : "Off"}
          </span>
          <Switch bind:checked={$form.enabled} />
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
            {isEditing ? "Save changes" : "Create place"}
          {/if}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
