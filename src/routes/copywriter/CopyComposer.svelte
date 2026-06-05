<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "$lib/components/ui/native-select/index.js";
  import {
    CHANNELS_BY_TYPE,
    CHANNEL_LABELS,
    COPY_TYPE_LABELS,
    VARIANT_COUNT_DEFAULT,
    VARIANT_COUNT_MAX,
    VARIANT_COUNT_MIN,
    isCopyType,
    type CopyType,
  } from "$lib/services/copywriter/types";
  import type { CopySubmitPayload, OfferOption } from "./composer-types";

  interface Props {
    busy?: boolean;
    brandSelected?: boolean;
    brandGuidelines?: string | null;
    offers: OfferOption[];
    onSubmit: (payload: CopySubmitPayload) => void;
  }

  let {
    busy = false,
    brandSelected = false,
    brandGuidelines = null,
    offers,
    onSubmit,
  }: Props = $props();

  const copyTypes = Object.keys(COPY_TYPE_LABELS) as CopyType[];

  let copyType = $state<CopyType>("aggregator_offer");
  let channel = $state<string>(CHANNELS_BY_TYPE.aggregator_offer[0]!);
  let brief = $state("");
  let tone = $state("");
  let variantCount = $state(VARIANT_COUNT_DEFAULT);
  let selectedOfferKey = $state("");

  let guidelinesText = $state("");
  let guidelinesEdited = $state(false);
  let showGuidelines = $state(false);

  // Keep the editable guidelines in sync with the selected brand. Editing the
  // textarea detaches from this until a different brand's guidelines arrive.
  // (Same logic as the image generator's PromptComposer.)
  let lastBrandGuidelines = $state<string | null>(null);
  let lastBrandSelected = $state(false);
  $effect(() => {
    if (
      brandGuidelines === lastBrandGuidelines &&
      brandSelected === lastBrandSelected
    )
      return;

    const previousBrandGuidelines = lastBrandGuidelines;
    lastBrandGuidelines = brandGuidelines;
    lastBrandSelected = brandSelected;

    if (!brandSelected) {
      guidelinesText = "";
      guidelinesEdited = false;
      showGuidelines = false;
      return;
    }

    if (brandGuidelines === null) {
      guidelinesText = "";
      guidelinesEdited = false;
      showGuidelines = false;
      return;
    }

    if (previousBrandGuidelines === null && guidelinesEdited) return;

    guidelinesText = brandGuidelines;
    guidelinesEdited = false;
    showGuidelines = brandGuidelines === "";
  });

  const hasBrandGuidelines = $derived(
    typeof brandGuidelines === "string" && brandGuidelines.trim().length > 0,
  );

  const channels = $derived(CHANNELS_BY_TYPE[copyType]);

  const selectedOffer = $derived(
    selectedOfferKey === ""
      ? null
      : (offers.find((o) => String(o.id) === selectedOfferKey) ?? null),
  );

  function handleTypeChange(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (!isCopyType(value)) return;
    copyType = value;
    channel = lockedChannelFor(value) ?? CHANNELS_BY_TYPE[value][0]!;
  }

  // Aggregator copy is locked to the selected offer's platform — the listing
  // only ever runs on the aggregator the offer is registered with.
  function lockedChannelFor(type: CopyType): string | null {
    return type === "aggregator_offer" && selectedOffer
      ? selectedOffer.aggregator
      : null;
  }

  function handleOfferChange(event: Event) {
    selectedOfferKey = (event.currentTarget as HTMLSelectElement).value;
    const offer = selectedOffer;
    if (!offer) return;
    if (copyType === "aggregator_offer") {
      channel = offer.aggregator;
    }
    if (brief.trim() === "") {
      brief = `Promote the "${offer.name}" offer.`;
    }
  }

  const channelLocked = $derived(lockedChannelFor(copyType) !== null);

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const trimmedBrief = brief.trim();
    if (trimmedBrief.length === 0 || busy) return;

    onSubmit({
      copyType,
      channel,
      brief: trimmedBrief,
      tone: tone.trim(),
      variantCount: Math.min(
        Math.max(variantCount, VARIANT_COUNT_MIN),
        VARIANT_COUNT_MAX,
      ),
      offerId: selectedOffer?.id ?? null,
      brandGuidelines: guidelinesText,
    });
  }
</script>

<form class="grid gap-4" onsubmit={handleSubmit}>
  {#if brandSelected}
    <div class="grid gap-2">
      <div class="flex items-center justify-between">
        <Label for="copyBrandGuidelines">Brand guidelines</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onclick={() => (showGuidelines = !showGuidelines)}
        >
          {showGuidelines
            ? "Hide"
            : hasBrandGuidelines
              ? "Edit guidelines"
              : "Add guidelines"}
        </Button>
      </div>
      {#if showGuidelines}
        <Textarea
          id="copyBrandGuidelines"
          rows={5}
          bind:value={guidelinesText}
          oninput={() => (guidelinesEdited = true)}
        />
        <p class="text-muted-foreground text-xs">
          Used as the tone-of-voice context for this brand. Changes apply to
          this session's generations only and are not saved back to the brand.
        </p>
      {:else}
        <p class="text-muted-foreground text-xs">
          {#if hasBrandGuidelines}
            This brand's guidelines will be applied. Click "Edit guidelines" to
            review or tweak them for this generation.
          {:else}
            Add guidelines to apply them to this session's generations for the
            selected brand.
          {/if}
        </p>
      {/if}
    </div>
  {/if}

  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <div class="grid gap-1.5">
      <Label for="copyType">Copy type</Label>
      <NativeSelect id="copyType" value={copyType} onchange={handleTypeChange}>
        {#each copyTypes as type (type)}
          <NativeSelectOption value={type}>
            {COPY_TYPE_LABELS[type]}
          </NativeSelectOption>
        {/each}
      </NativeSelect>
    </div>

    <div class="grid gap-1.5">
      <Label for="copyChannel">Channel</Label>
      <NativeSelect
        id="copyChannel"
        bind:value={channel}
        disabled={channelLocked}
      >
        {#each channels as ch (ch)}
          <NativeSelectOption value={ch}>
            {CHANNEL_LABELS[ch] ?? ch}
          </NativeSelectOption>
        {/each}
      </NativeSelect>
      {#if channelLocked}
        <p class="text-muted-foreground text-xs">
          Locked to the selected offer's aggregator.
        </p>
      {/if}
    </div>

    <div class="grid gap-1.5">
      <Label for="copyOffer">Offer (optional)</Label>
      <NativeSelect
        id="copyOffer"
        value={selectedOfferKey}
        onchange={handleOfferChange}
      >
        <NativeSelectOption value="">No offer</NativeSelectOption>
        {#each offers as offer (offer.id)}
          <NativeSelectOption value={String(offer.id)}>
            {offer.name} ({CHANNEL_LABELS[offer.aggregator] ??
              offer.aggregator})
          </NativeSelectOption>
        {/each}
      </NativeSelect>
    </div>

    <div class="grid gap-1.5">
      <Label for="copyVariantCount">Variants</Label>
      <Input
        id="copyVariantCount"
        type="number"
        min={VARIANT_COUNT_MIN}
        max={VARIANT_COUNT_MAX}
        bind:value={variantCount}
      />
    </div>
  </div>

  <div class="grid gap-1.5">
    <Label for="copyBrief">Brief</Label>
    <Textarea
      id="copyBrief"
      rows={4}
      placeholder="What are we promoting? Include the deal mechanics (e.g. -30% on family menu), the audience, and anything that must be mentioned."
      bind:value={brief}
    />
  </div>

  <div class="grid gap-1.5 sm:max-w-sm">
    <Label for="copyTone">Tone (optional)</Label>
    <Input
      id="copyTone"
      placeholder="e.g. playful, premium, urgent"
      bind:value={tone}
    />
  </div>

  <div>
    <Button type="submit" disabled={busy || brief.trim().length === 0}>
      {busy ? "Generating…" : "Generate copy"}
    </Button>
  </div>
</form>
