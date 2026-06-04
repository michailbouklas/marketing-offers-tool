<script lang="ts">
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import XIcon from "@lucide/svelte/icons/x";
  import ChipInput from "./ChipInput.svelte";
  import SelectWithCustom from "./SelectWithCustom.svelte";
  import { suggestStructuredPrompt } from "$lib/services/image-generator/image-generator-client";
  import {
    ASPECT_RATIOS,
    ATMOSPHERE_EFFECTS,
    AVOID_ITEMS,
    BACKGROUNDS,
    CLARITY_OPTIONS,
    COMPOSITIONS,
    DETAIL_BEHAVIORS,
    DETAIL_OBJECTS,
    FOOD_MATERIALS,
    LIGHTING_SETUPS,
    MOODS,
    PHOTO_STYLES,
    RENDER_FLAGS,
    createDefaultStructuredPromptState,
    mergeSuggestionIntoState,
    serializeStructuredPrompt,
  } from "$lib/services/image-generator/structured-prompt";

  interface Props {
    open: boolean;
    brandGuidelines?: string | null;
    brandName?: string | null;
    onUsePrompt: (prompt: string) => void;
  }

  let {
    open = $bindable(),
    brandGuidelines = null,
    brandName = null,
    onUsePrompt,
  }: Props = $props();

  const hasGuidelines = $derived(
    typeof brandGuidelines === "string" && brandGuidelines.trim() !== "",
  );

  // Builder state intentionally survives close/reopen so designers can
  // iterate on a scene; "Reset" returns to the food-photography defaults.
  let builder = $state(createDefaultStructuredPromptState());
  let description = $state("");
  let suggesting = $state(false);

  const previewText = $derived(serializeStructuredPrompt(builder));
  const canUse = $derived(builder.primarySubject.trim() !== "");

  async function handleSuggest() {
    const desc = description.trim();
    if (desc === "" || suggesting) return;
    suggesting = true;
    try {
      const suggestion = await suggestStructuredPrompt(
        desc,
        brandGuidelines ?? undefined,
      );
      builder = mergeSuggestionIntoState(builder, suggestion);
      toast.success("Form filled with AI suggestions — tweak anything.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      suggesting = false;
    }
  }

  function addDetailRow() {
    builder.detailSystems = [
      ...builder.detailSystems,
      { object: "", behavior: "" },
    ];
  }

  function removeDetailRow(index: number) {
    builder.detailSystems = builder.detailSystems.filter((_, i) => i !== index);
  }

  function reset() {
    builder = createDefaultStructuredPromptState();
    description = "";
  }

  async function copyPreview() {
    try {
      await navigator.clipboard.writeText(previewText);
      toast.success("Prompt copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  function usePrompt() {
    if (!canUse) return;
    onUsePrompt(previewText);
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[90vh] flex-col sm:max-w-5xl">
    <Dialog.Header>
      <Dialog.Title>Structured prompt builder</Dialog.Title>
      <Dialog.Description>
        Build a food-photography prompt step by step — no JSON knowledge needed.
        The preview shows exactly what will be sent to the image model.
      </Dialog.Description>
    </Dialog.Header>

    <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
      <div class="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <!-- AI prefill -->
        <div class="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
          <Label for="spb-description" class="text-sm font-medium">
            Describe your shot, let AI fill the form
          </Label>
          <div class="flex gap-2">
            <Input
              id="spb-description"
              class="flex-1"
              placeholder="e.g. souvlaki wrap on a wooden board"
              bind:value={description}
              onkeydown={(e: KeyboardEvent) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSuggest();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={suggesting || description.trim() === ""}
              onclick={handleSuggest}
            >
              <SparklesIcon class="size-4" />
              {suggesting ? "Suggesting…" : "Suggest with AI"}
            </Button>
          </div>
          <p class="text-muted-foreground text-xs">
            {#if hasGuidelines}
              Suggestions follow the {brandName ?? "selected brand"} guidelines. Every
              field below stays editable.
            {:else}
              Every field below stays editable — AI suggestions are just a
              starting point. Select a brand on the page to get brand-aware
              suggestions.
            {/if}
          </p>
        </div>

        <!-- Scene basics -->
        <section class="flex flex-col gap-3">
          <h3 class="text-sm font-semibold">Scene basics</h3>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="flex flex-col gap-1.5">
              <Label for="spb-name">Shot name</Label>
              <Input
                id="spb-name"
                placeholder="e.g. Souvlaki Hero Shot"
                bind:value={builder.shortName}
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="spb-aspect">Image shape</Label>
              <SelectWithCustom
                id="spb-aspect"
                options={ASPECT_RATIOS}
                bind:value={builder.aspectRatio}
              />
            </div>
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="spb-style">Photography style</Label>
            <SelectWithCustom
              id="spb-style"
              options={PHOTO_STYLES}
              bind:value={builder.style}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="spb-clarity">Focus &amp; sharpness</Label>
            <SelectWithCustom
              id="spb-clarity"
              options={CLARITY_OPTIONS}
              bind:value={builder.clarity}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Quality finish</Label>
            <ChipInput
              bind:value={builder.renderFlags}
              suggestions={RENDER_FLAGS}
              placeholder="Add a quality flag…"
            />
          </div>
        </section>

        <Separator />

        <!-- Environment & lighting -->
        <section class="flex flex-col gap-3">
          <h3 class="text-sm font-semibold">Environment &amp; lighting</h3>
          <div class="flex flex-col gap-1.5">
            <Label for="spb-background">Background / surface</Label>
            <SelectWithCustom
              id="spb-background"
              options={BACKGROUNDS}
              bind:value={builder.background}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="spb-lighting">Lighting</Label>
            <SelectWithCustom
              id="spb-lighting"
              options={LIGHTING_SETUPS}
              bind:value={builder.lighting}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Atmosphere</Label>
            <ChipInput
              bind:value={builder.atmosphere}
              suggestions={ATMOSPHERE_EFFECTS}
              placeholder="Add an atmosphere effect…"
            />
          </div>
        </section>

        <Separator />

        <!-- Hero subject & materials -->
        <section class="flex flex-col gap-3">
          <h3 class="text-sm font-semibold">Hero subject &amp; textures</h3>
          <div class="flex flex-col gap-1.5">
            <Label for="spb-subject">
              The dish / product
              <span class="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="spb-subject"
              placeholder="e.g. souvlaki wrap with grilled chicken on a wooden board"
              bind:value={builder.primarySubject}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Visible textures &amp; materials</Label>
            <ChipInput
              bind:value={builder.materials}
              suggestions={FOOD_MATERIALS}
              placeholder="Add a texture or material…"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="spb-composition">Composition</Label>
            <SelectWithCustom
              id="spb-composition"
              options={COMPOSITIONS}
              bind:value={builder.composition}
            />
          </div>
        </section>

        <Separator />

        <!-- Dynamic details -->
        <section class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">Dynamic details</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onclick={addDetailRow}
            >
              <PlusIcon class="size-4" />
              Add detail
            </Button>
          </div>
          <p class="text-muted-foreground text-xs">
            Optional moving or floating elements — splashes, steam, crumbs — and
            how they behave.
          </p>
          {#each builder.detailSystems as detail, index (index)}
            <div class="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Input
                aria-label="Detail element"
                placeholder="e.g. liquid splash"
                list="spb-detail-objects"
                bind:value={detail.object}
              />
              <Input
                aria-label="Detail behavior"
                placeholder="e.g. thick glossy arc"
                list="spb-detail-behaviors"
                bind:value={detail.behavior}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove detail"
                onclick={() => removeDetailRow(index)}
              >
                <XIcon class="size-4" />
              </Button>
            </div>
          {/each}
          <datalist id="spb-detail-objects">
            {#each DETAIL_OBJECTS as option (option)}
              <option value={option}></option>
            {/each}
          </datalist>
          <datalist id="spb-detail-behaviors">
            {#each DETAIL_BEHAVIORS as option (option)}
              <option value={option}></option>
            {/each}
          </datalist>
        </section>

        <Separator />

        <!-- Output -->
        <section class="flex flex-col gap-3">
          <h3 class="text-sm font-semibold">Final look</h3>
          <div class="flex flex-col gap-1.5">
            <Label for="spb-mood">Mood</Label>
            <SelectWithCustom
              id="spb-mood"
              options={MOODS}
              bind:value={builder.mood}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>Things to avoid</Label>
            <ChipInput
              bind:value={builder.avoid}
              suggestions={AVOID_ITEMS}
              placeholder="Add something to avoid…"
            />
          </div>
        </section>
      </div>

      <!-- Live preview -->
      <div class="flex min-h-0 flex-col gap-2">
        <div class="flex items-center justify-between">
          <Label class="text-sm font-medium">Prompt preview</Label>
          <Button type="button" variant="ghost" size="sm" onclick={copyPreview}>
            <CopyIcon class="size-4" />
            Copy
          </Button>
        </div>
        <pre
          class="bg-muted/40 text-foreground min-h-0 flex-1 overflow-auto rounded-lg border p-3 text-xs leading-relaxed whitespace-pre-wrap">{previewText}</pre>
      </div>
    </div>

    <Dialog.Footer class="gap-2 sm:justify-between">
      <Button type="button" variant="ghost" onclick={reset}>Reset</Button>
      <div class="flex gap-2">
        <Button type="button" variant="outline" onclick={() => (open = false)}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canUse}
          title={canUse ? undefined : "Describe the dish / product first"}
          onclick={usePrompt}
        >
          Use this prompt
        </Button>
      </div>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
