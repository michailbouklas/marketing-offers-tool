<script lang="ts">
  import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
  import { untrack } from "svelte";
  import { zod4Client } from "sveltekit-superforms/adapters";
  import { superForm } from "sveltekit-superforms/client";
  import type { SuperValidated } from "sveltekit-superforms";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { formatBrandLabel, type BrandOption } from "$lib/services/brands";
  import {
    aggregatorOptions,
    getDefaultOfferEditorFormData,
    type OfferEditorActionMessage,
    type OfferEditorFormDefaults,
    offerEditorFormSchema,
    type OfferEditorFormData,
  } from "$lib/services/offer-editor-form";

  type Props = {
    form: SuperValidated<OfferEditorFormData>;
    mode?: "create" | "edit";
    action?: string;
    values?: OfferEditorFormDefaults;
    brands: BrandOption[];
    offerDbId?: number | null;
    onSuccess?: (message: OfferEditorActionMessage) => void;
  };

  let {
    form: initialForm,
    mode = "create",
    action = "?/createOffer",
    values = getDefaultOfferEditorFormData(),
    brands,
    offerDbId = null,
    onSuccess,
  }: Props = $props();

  let startsAtInput = $state<HTMLInputElement | null>(null);
  let endsAtInput = $state<HTMLInputElement | null>(null);

  const editorMode = $derived(mode);

  // svelte-ignore state_referenced_locally
  const { form, errors, constraints, enhance, submitting, message } = superForm(
    untrack(() => initialForm),
    {
      applyAction: true,
      invalidateAll: true,
      resetForm: mode === "create",
      id: mode === "create" ? "create-offer" : "edit-offer",
      validators: zod4Client(offerEditorFormSchema),
      onUpdated: ({ form }) => {
        if (form.valid && form.message) {
          onSuccess?.(form.message as OfferEditorActionMessage);
        }
      },
    },
  );

  $effect(() => {
    const nextValues = values;

    $form.name = nextValues.name;
    $form.offerId = nextValues.offerId;
    $form.aggregator =
      nextValues.aggregator === ""
        ? aggregatorOptions[0]
        : nextValues.aggregator;
    $form.brandId = nextValues.brandId;
    $form.details = nextValues.details;
    $form.startsAt = nextValues.startsAt;
    $form.endsAt = nextValues.endsAt;
    $form.active = nextValues.active;
  });

  $effect(() => {
    if (editorMode === "create" && values.aggregator === "") {
      $form.aggregator = aggregatorOptions[0];
    }
  });

  const title = $derived(
    editorMode === "create" ? "Create offer" : "Edit offer",
  );
  const description = $derived(
    editorMode === "create"
      ? "Add a new campaign so the marketing team can track it across aggregators."
      : "Update the offer details, timing, and active state.",
  );
  const submitLabel = $derived(
    editorMode === "create" ? "Create Offer" : "Save Changes",
  );

  function openDateTimePicker(input: HTMLInputElement | null) {
    if (!input) {
      return;
    }

    input.focus();
    input.showPicker?.();
    input.click();
  }
</script>

<form method="POST" {action} use:enhance class="space-y-5">
  <div class="space-y-1">
    <h3 class="text-lg font-semibold tracking-[-0.02em]">{title}</h3>
    <p class="text-muted-foreground text-sm leading-6">{description}</p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <div class="space-y-2">
      <Label for="offer-editor-name">Name</Label>
      <Input
        id="offer-editor-name"
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
      <Label for="offer-editor-offer-id">Offer ID</Label>
      <Input
        id="offer-editor-offer-id"
        name="offerId"
        bind:value={$form.offerId}
        aria-invalid={!!$errors.offerId}
        {...$constraints.offerId}
      />
      {#if $errors.offerId}
        <p class="text-destructive text-sm">{$errors.offerId}</p>
      {/if}
    </div>

    <div class="space-y-2">
      <Label for="offer-editor-aggregator">Aggregator</Label>
      <NativeSelect.Root
        id="offer-editor-aggregator"
        name="aggregator"
        class="w-full"
        bind:value={$form.aggregator}
        aria-invalid={!!$errors.aggregator}
      >
        <NativeSelect.Option value="">Select aggregator</NativeSelect.Option>
        {#each aggregatorOptions as option}
          <NativeSelect.Option value={option}>{option}</NativeSelect.Option>
        {/each}
      </NativeSelect.Root>
      {#if $errors.aggregator}
        <p class="text-destructive text-sm">{$errors.aggregator}</p>
      {/if}
    </div>

    <div class="space-y-2">
      <Label for="offer-editor-brand-id">Brand</Label>
      <NativeSelect.Root
        id="offer-editor-brand-id"
        name="brandId"
        class="w-full"
        bind:value={$form.brandId}
        aria-invalid={!!$errors.brandId}
      >
        <NativeSelect.Option value="">Select brand</NativeSelect.Option>
        {#each brands as brand}
          <NativeSelect.Option value={brand.id.toString()}>
            {formatBrandLabel(brand)}
          </NativeSelect.Option>
        {/each}
      </NativeSelect.Root>
      {#if $errors.brandId}
        <p class="text-destructive text-sm">{$errors.brandId}</p>
      {/if}
    </div>

    <div class="space-y-2">
      <Label for="offer-editor-starts-at">Starts at</Label>
      <div class="relative">
        <Input
          id="offer-editor-starts-at"
          bind:ref={startsAtInput}
          name="startsAt"
          type="datetime-local"
          class="pr-12"
          bind:value={$form.startsAt}
          aria-invalid={!!$errors.startsAt}
          {...$constraints.startsAt}
        />
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md transition-colors"
          aria-label="Open start date picker"
          onclick={() => openDateTimePicker(startsAtInput)}
        >
          <CalendarClockIcon class="size-4" />
        </button>
      </div>
      {#if $errors.startsAt}
        <p class="text-destructive text-sm">{$errors.startsAt}</p>
      {/if}
    </div>

    <div class="space-y-2">
      <Label for="offer-editor-ends-at">Ends at</Label>
      <div class="relative">
        <Input
          id="offer-editor-ends-at"
          bind:ref={endsAtInput}
          name="endsAt"
          type="datetime-local"
          class="pr-12"
          bind:value={$form.endsAt}
          aria-invalid={!!$errors.endsAt}
          {...$constraints.endsAt}
        />
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md transition-colors"
          aria-label="Open end date picker"
          onclick={() => openDateTimePicker(endsAtInput)}
        >
          <CalendarClockIcon class="size-4" />
        </button>
      </div>
      {#if $errors.endsAt}
        <p class="text-destructive text-sm">{$errors.endsAt}</p>
      {/if}
    </div>
  </div>

  <div class="space-y-2">
    <div class="flex items-center justify-between gap-3">
      <Label for="offer-editor-details">Details</Label>
      <span class="text-muted-foreground text-xs">Optional</span>
    </div>
    <Textarea
      id="offer-editor-details"
      name="details"
      rows={5}
      bind:value={$form.details}
      aria-invalid={!!$errors.details}
      {...$constraints.details}
    />
  </div>

  <div
    class="border-border bg-muted/30 flex items-center justify-between rounded-xl border px-4 py-3"
  >
    <div class="space-y-1">
      <p class="text-sm font-medium">Active offer</p>
      <p class="text-muted-foreground text-xs leading-5">
        Keep this enabled while the campaign should appear in reporting.
      </p>
    </div>
    <div class="flex items-center gap-3">
      <span class="text-muted-foreground text-sm"
        >{$form.active ? "On" : "Off"}</span
      >
      <Switch bind:checked={$form.active} />
    </div>
  </div>
  <input type="hidden" name="active" value={$form.active ? "true" : "false"} />
  {#if offerDbId !== null}
    <input type="hidden" name="offerDbId" value={offerDbId} />
  {/if}

  <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
    {#if editorMode === "create"}
      <Button
        type="submit"
        name="submitMode"
        value="createAndAddNew"
        variant="outline"
        disabled={$submitting}
      >
        {$submitting ? "Saving..." : "Create and Add New"}
      </Button>
    {/if}
    <Button type="submit" disabled={$submitting}>
      {$submitting ? "Saving..." : submitLabel}
    </Button>
  </div>
</form>
