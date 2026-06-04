<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "$lib/components/ui/native-select/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import ImageIcon from "@lucide/svelte/icons/image";
  import Settings2Icon from "@lucide/svelte/icons/settings-2";
  import XIcon from "@lucide/svelte/icons/x";
  import type { Snippet } from "svelte";
  import ModelSelectorDialog from "./ModelSelectorDialog.svelte";
  import type { SavedComposerSettings } from "$lib/services/image-generator/composer-library";
  import type {
    ImageGeneratorConfig,
    ImageProviderId,
  } from "$lib/services/image-providers/config";
  import { modelLabel } from "$lib/services/image-providers/model-display";
  import {
    AUTO_SIZE,
    CUSTOM_SIZE,
    intersectModelSizes,
    parseSize,
    ratioOf,
    sizeLabel,
  } from "$lib/services/image-providers/model-sizes";
  import {
    BACKGROUND_OPTIONS,
    CAMERAS,
    OUTPUT_FORMATS,
    QUALITY_OPTIONS,
    STYLES,
    type Background,
    type Camera,
    type ComposerState,
    type OutputFormat,
    type Quality,
    type Style,
    type SubmitPayload,
  } from "./composer-types";

  interface Props {
    config: ImageGeneratorConfig;
    busy?: boolean;
    initial?: Partial<ComposerState> | null;
    currentBrandId?: number | null;
    brandSelected?: boolean;
    brandGuidelines?: string | null;
    onSubmit: (state: SubmitPayload) => void;
    onUploadReferences?: (files: File[]) => Promise<string[]>;
    afterPrompt?: Snippet;
    onViewBrandAssets?: () => void;
    canViewBrandAssets?: boolean;
  }

  let {
    config,
    busy = false,
    initial = null,
    currentBrandId = null,
    brandSelected = false,
    brandGuidelines = null,
    onSubmit,
    onUploadReferences,
    afterPrompt,
    onViewBrandAssets,
    canViewBrandAssets = false,
  }: Props = $props();

  const defaultProvider = $derived(
    config.defaultProvider ?? config.providers[0]?.id ?? "imagerouter",
  );
  const defaultModel = $derived(
    config.defaultModel ?? config.providers[0]?.models[0]?.id ?? "gpt-image-1",
  );

  let prompt = $state("");
  let provider = $state<ImageProviderId>("imagerouter");
  let selectedModels = $state<string[]>([]);
  let modelDialogOpen = $state(false);
  let settingsOpen = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);
  // `sizeChoice` is the dropdown value (a concrete "WxH", "auto", or "custom");
  // `customSize` holds the free-typed resolution when "custom" is picked.
  let sizeChoice = $state("1024x1024");
  let customSize = $state("1024x1024");
  let aspectFilter = $state("all");
  let style = $state<Style>("none");
  let camera = $state<Camera>("none");
  let outputFormat = $state<OutputFormat>("png");
  let negativePrompt = $state("");
  let quality = $state<Quality>("auto");
  let background = $state<Background>("auto");
  let matchReferences = $state(false);
  let enhance = $state(true);
  let samplesPerModel = $state(1);
  let referenceFiles = $state<File[]>([]);
  let preUploadedReferenceIds = $state<string[]>([]);
  let guidelinesText = $state("");
  let guidelinesEdited = $state(false);
  let showGuidelines = $state(false);
  let didInit = $state(false);

  // Keep the editable guidelines in sync with the selected brand. Editing the
  // textarea detaches from this until a different brand's guidelines arrive.
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

  $effect(() => {
    if (didInit) return;
    didInit = true;
    prompt = initial?.prompt ?? "";
    provider = (initial?.provider as ImageProviderId) ?? defaultProvider;
    const initialModels =
      initial?.models && initial.models.length > 0
        ? initial.models
        : [defaultModel];
    selectedModels = [...initialModels];
    const initSize = initial?.size;
    if (initSize && parseSize(initSize)) {
      customSize = initSize;
      sizeChoice = initSize;
    } else if (initSize) {
      sizeChoice = initSize;
    }
    style = initial?.style ?? "none";
    camera = initial?.camera ?? "none";
    outputFormat = initial?.outputFormat ?? "png";
    negativePrompt = initial?.negativePrompt ?? "";
    quality = initial?.quality ?? "auto";
    background = initial?.background ?? "auto";
    matchReferences = initial?.matchReferences ?? false;
    enhance = initial?.enhance ?? true;
    samplesPerModel = initial?.samplesPerModel ?? 1;
    preUploadedReferenceIds = initial?.referenceIds ?? [];
  });

  const samplesMax = $derived(Math.max(1, config.samplesPerModelMax));

  // Clamp to [1, samplesMax] so the user can never request more than the
  // server's SAMPLES_PER_MODEL_MAX (applies to single-model runs too).
  $effect(() => {
    const n = Number(samplesPerModel);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(samplesMax, Math.max(1, Math.floor(n)));
    if (clamped !== samplesPerModel) samplesPerModel = clamped;
  });

  const providerModels = $derived(
    config.providers.find((p) => p.id === provider)?.models ?? [],
  );
  const providerModelIds = $derived(providerModels.map((m) => m.id));

  // Drop any selected models that no longer exist on the active provider.
  // If nothing is left, fall back to the provider's first model so the user
  // can submit immediately after switching providers.
  $effect(() => {
    const validSet = new Set(providerModelIds);
    const filtered = selectedModels.filter((m) => validSet.has(m));
    if (filtered.length !== selectedModels.length) {
      selectedModels =
        filtered.length > 0
          ? filtered
          : providerModelIds.length > 0
            ? [providerModelIds[0]!]
            : [];
    }
  });

  const selectedModelConfigs = $derived(
    providerModels.filter((m) => selectedModels.includes(m.id)),
  );

  // Resolutions every selected model accepts (intersection). May include the
  // "auto"/"custom" sentinels. Empty = the models share no common size.
  const availableSizes = $derived(intersectModelSizes(selectedModelConfigs));
  const noOverlap = $derived(
    selectedModelConfigs.length > 0 && availableSizes.length === 0,
  );

  // Distinct aspect ratios present among the concrete sizes, for the filter.
  const availableRatios = $derived([
    ...new Set(
      availableSizes
        .map((s) => ratioOf(s))
        .filter((r): r is string => r !== null),
    ),
  ]);

  const filteredSizes = $derived(
    aspectFilter === "all"
      ? availableSizes
      : availableSizes.filter((s) => ratioOf(s) === aspectFilter),
  );

  // Keep the chosen resolution valid as the model selection / filter changes.
  $effect(() => {
    if (noOverlap) {
      if (sizeChoice !== AUTO_SIZE) sizeChoice = AUTO_SIZE;
      return;
    }
    if (filteredSizes.includes(sizeChoice)) return;
    // A concrete pick that's no longer offered: keep it via the custom field
    // when custom is available, otherwise snap to the first valid option.
    if (availableSizes.includes(CUSTOM_SIZE) && parseSize(sizeChoice)) {
      customSize = sizeChoice;
      sizeChoice = CUSTOM_SIZE;
      return;
    }
    if (filteredSizes.length > 0) sizeChoice = filteredSizes[0]!;
  });

  // The resolution actually submitted.
  const size = $derived(
    sizeChoice === CUSTOM_SIZE ? customSize.trim() : sizeChoice,
  );

  const anySupportsQuality = $derived(
    selectedModelConfigs.length === 0 ||
      selectedModelConfigs.some((m) => m.supportsQuality),
  );
  const anySupportsReferences = $derived(
    selectedModelConfigs.length === 0 ||
      selectedModelConfigs.some((m) => m.supportsReferences),
  );

  const allProviderModelsSelected = $derived(
    providerModels.length > 0 &&
      selectedModels.length === providerModels.length,
  );

  function isModelSelected(model: string): boolean {
    return selectedModels.includes(model);
  }

  function toggleModel(model: string) {
    selectedModels = isModelSelected(model)
      ? selectedModels.filter((m) => m !== model)
      : [...selectedModels, model];
  }

  const hasReferences = $derived(
    preUploadedReferenceIds.length > 0 || referenceFiles.length > 0,
  );

  // Transparency needs an alpha-capable format; JPG can't carry it, so pin the
  // output to PNG whenever a transparent background is requested.
  $effect(() => {
    if (background === "transparent" && outputFormat !== "png") {
      outputFormat = "png";
    }
  });

  const canSubmit = $derived(
    prompt.trim().length > 0 &&
      providerModels.length > 0 &&
      selectedModels.length > 0 &&
      !busy,
  );

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    let referenceIds = [...preUploadedReferenceIds];
    if (referenceFiles.length > 0 && onUploadReferences) {
      const uploaded = await onUploadReferences(referenceFiles);
      referenceIds = [...referenceIds, ...uploaded];
    }

    onSubmit({
      prompt: prompt.trim(),
      provider,
      models: [...selectedModels],
      size,
      style,
      camera,
      outputFormat,
      negativePrompt: negativePrompt.trim(),
      quality,
      background,
      // input_fidelity is only meaningful with references attached.
      matchReferences: matchReferences && referenceIds.length > 0,
      enhance,
      samplesPerModel,
      referenceIds,
      referenceFiles,
      brandGuidelines:
        brandSelected && (brandGuidelines !== null || guidelinesEdited)
          ? guidelinesText
          : undefined,
    });

    referenceFiles = [];
    preUploadedReferenceIds = [];
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    referenceFiles = Array.from(input.files);
  }

  function removeReference(id: string) {
    preUploadedReferenceIds = preUploadedReferenceIds.filter((r) => r !== id);
  }

  export function loadFrom(state: Partial<ComposerState>) {
    if (state.prompt !== undefined) prompt = state.prompt;
    if (state.provider) provider = state.provider;
    if (state.models) selectedModels = [...state.models];
    if (state.size) {
      if (parseSize(state.size)) {
        customSize = state.size;
      }
      sizeChoice = state.size;
    }
    if (state.style) style = state.style;
    if (state.camera) camera = state.camera;
    if (state.outputFormat) outputFormat = state.outputFormat;
    if (state.negativePrompt !== undefined)
      negativePrompt = state.negativePrompt;
    if (state.quality) quality = state.quality;
    if (state.background) background = state.background;
    if (state.matchReferences !== undefined)
      matchReferences = state.matchReferences;
    if (state.enhance !== undefined) enhance = state.enhance;
    if (state.samplesPerModel !== undefined)
      samplesPerModel = state.samplesPerModel;
    if (state.referenceIds) preUploadedReferenceIds = state.referenceIds;
  }

  // The guidelines text that would actually be sent with a generation —
  // including any local edits the user made for this session. Mirrors the
  // brandGuidelines logic in handleSubmit.
  export function getEffectiveBrandGuidelines(): string | null {
    return brandSelected && (brandGuidelines !== null || guidelinesEdited)
      ? guidelinesText
      : null;
  }

  export function getSettings(): SavedComposerSettings {
    return {
      provider: provider as SavedComposerSettings["provider"],
      models: [...selectedModels],
      size,
      style,
      camera,
      outputFormat,
      negativePrompt: negativePrompt.trim(),
      quality,
      background,
      matchReferences,
      enhance,
      samplesPerModel,
      brandId: currentBrandId,
    };
  }

  export function getTemplateState(): {
    prompt: string;
    settings: SavedComposerSettings;
  } {
    return {
      prompt: prompt.trim(),
      settings: getSettings(),
    };
  }
</script>

{#if config.providers.length === 0}
  <p class="text-muted-foreground rounded-xl border p-4 text-sm">
    No image providers are configured. Set <code>IMAGE_ROUTER_API_KEY</code>
    or <code>OPENAI_API_KEY</code> in your environment to enable generation.
  </p>
{:else}
  <form class="grid gap-4" onsubmit={handleSubmit}>
    {#if brandSelected}
      <div class="grid gap-2">
        <div class="flex items-center justify-between">
          <Label for="brandGuidelines">Brand guidelines</Label>
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
            id="brandGuidelines"
            rows={5}
            bind:value={guidelinesText}
            oninput={() => (guidelinesEdited = true)}
          />
          <p class="text-muted-foreground text-xs">
            Prepended to the prompt for this brand. Changes apply to this
            session's generations only and are not saved back to the brand.
          </p>
        {:else}
          <p class="text-muted-foreground text-xs">
            {#if hasBrandGuidelines}
              This brand's guidelines will be applied. Click "Edit guidelines"
              to review or tweak them for this generation.
            {:else}
              Add guidelines to apply them to this session's generations for the
              selected brand.
            {/if}
          </p>
        {/if}
      </div>
    {/if}

    <!-- Rich prompt container -->
    <div
      class="bg-card focus-within:ring-ring/40 rounded-xl border p-3 shadow-sm transition focus-within:ring-2"
    >
      {#if preUploadedReferenceIds.length > 0}
        <div class="mb-2 flex flex-wrap gap-2 pl-1">
          {#each preUploadedReferenceIds as refId (refId)}
            <div
              class="border-input bg-muted relative size-14 overflow-hidden rounded-md border"
            >
              <img
                src={`/api/images/references/${refId}`}
                alt="Attached reference"
                class="size-full object-cover"
                loading="lazy"
              />
              <button
                type="button"
                aria-label="Remove reference"
                title="Remove reference"
                class="bg-background/90 text-foreground hover:bg-destructive hover:text-destructive-foreground absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full border text-xs leading-none shadow-sm"
                onclick={() => removeReference(refId)}
              >
                ×
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <div class="flex items-start gap-2">
        <button
          type="button"
          title="Add reference image"
          aria-label="Add reference image"
          class="text-muted-foreground hover:text-foreground hover:bg-accent mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md transition-colors"
          onclick={() => fileInput?.click()}
        >
          <ImageIcon class="size-5" />
        </button>
        <Textarea
          id="prompt"
          placeholder="Describe what you want to see"
          rows={2}
          bind:value={prompt}
          class="min-h-10 flex-1 resize-none border-0 bg-transparent px-0 py-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </div>

      {#if referenceFiles.length > 0}
        <p class="text-muted-foreground mt-1 pl-10 text-xs">
          {referenceFiles.length} file{referenceFiles.length === 1 ? "" : "s"} ready
          to upload on generate.
        </p>
      {/if}

      <!-- Toolbar -->
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={providerModels.length === 0}
          onclick={() => (modelDialogOpen = true)}
        >
          Select models
        </Button>

        {#if providerModels.length === 0}
          <span class="text-muted-foreground text-xs">No models configured</span
          >
        {:else if selectedModels.length === 0}
          <span class="text-muted-foreground text-xs">No models selected</span>
        {:else}
          {#each selectedModels as modelId (modelId)}
            <span
              class="bg-secondary text-secondary-foreground inline-flex h-7 items-center gap-1 rounded-full py-0.5 pr-1 pl-3 text-xs font-medium"
            >
              {modelLabel(modelId)}
              <button
                type="button"
                aria-label={`Remove ${modelLabel(modelId)}`}
                title="Remove model"
                class="hover:bg-background/60 flex size-5 items-center justify-center rounded-full transition-colors"
                onclick={() => toggleModel(modelId)}
              >
                <XIcon class="size-3.5" />
              </button>
            </span>
          {/each}
        {/if}

        <div class="ml-auto flex items-center gap-1">
          <Popover.Root bind:open={settingsOpen}>
            <Popover.Trigger
              aria-label="Model settings"
              title="Model settings"
              class={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <Settings2Icon class="size-4" />
            </Popover.Trigger>

            <Popover.Content
              align="end"
              collisionPadding={8}
              class="max-h-(--bits-floating-available-height) w-[24rem] overflow-y-auto p-4"
            >
              <div class="grid gap-3">
                <p
                  class="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
                >
                  Model settings
                </p>

                <div class="grid gap-3 sm:grid-cols-2">
                  {#if availableRatios.length > 1}
                    <div class="grid gap-1.5">
                      <Label for="aspectFilter" class="text-xs">
                        Aspect ratio
                      </Label>
                      <NativeSelect id="aspectFilter" bind:value={aspectFilter}>
                        <NativeSelectOption value="all">
                          All ratios
                        </NativeSelectOption>
                        {#each availableRatios as r (r)}
                          <NativeSelectOption value={r}>
                            {r}
                          </NativeSelectOption>
                        {/each}
                      </NativeSelect>
                    </div>
                  {/if}

                  <div class="grid gap-1.5">
                    <Label for="size" class="text-xs">Resolution</Label>
                    {#if noOverlap}
                      <p
                        class="border-input text-muted-foreground rounded-md border px-3 py-2 text-xs"
                      >
                        The selected models share no common resolution — using
                        each model's default (auto).
                      </p>
                    {:else}
                      <NativeSelect id="size" bind:value={sizeChoice}>
                        {#each filteredSizes as s (s)}
                          <NativeSelectOption value={s}>
                            {sizeLabel(s)}
                          </NativeSelectOption>
                        {/each}
                      </NativeSelect>
                      {#if sizeChoice === CUSTOM_SIZE}
                        <Input
                          aria-label="Custom resolution (WxH)"
                          placeholder="e.g. 1024x576"
                          bind:value={customSize}
                        />
                        <p class="text-muted-foreground text-xs">
                          Width × height in pixels (e.g. <code>1024x576</code>).
                        </p>
                      {/if}
                    {/if}
                  </div>

                  <div class="grid gap-1.5">
                    <Label for="style" class="text-xs">Style</Label>
                    <NativeSelect id="style" bind:value={style}>
                      {#each STYLES as s (s)}
                        <NativeSelectOption value={s}>{s}</NativeSelectOption>
                      {/each}
                    </NativeSelect>
                  </div>

                  <div class="grid gap-1.5">
                    <Label for="camera" class="text-xs">Camera</Label>
                    <NativeSelect id="camera" bind:value={camera}>
                      {#each CAMERAS as c (c)}
                        <NativeSelectOption value={c}>{c}</NativeSelectOption>
                      {/each}
                    </NativeSelect>
                  </div>

                  <div class="grid gap-1.5">
                    <Label for="outputFormat" class="text-xs"
                      >Output format</Label
                    >
                    <NativeSelect
                      id="outputFormat"
                      bind:value={outputFormat}
                      disabled={background === "transparent"}
                    >
                      {#each OUTPUT_FORMATS as f (f)}
                        <NativeSelectOption value={f}>
                          {f.toUpperCase()}
                        </NativeSelectOption>
                      {/each}
                    </NativeSelect>
                    {#if background === "transparent"}
                      <p class="text-muted-foreground text-xs">
                        Forced to PNG for a transparent background.
                      </p>
                    {/if}
                  </div>

                  {#if anySupportsQuality}
                    <div class="grid gap-1.5">
                      <Label for="quality" class="text-xs">Quality</Label>
                      <NativeSelect id="quality" bind:value={quality}>
                        {#each QUALITY_OPTIONS as q (q.value)}
                          <NativeSelectOption value={q.value}>
                            {q.label}
                          </NativeSelectOption>
                        {/each}
                      </NativeSelect>
                    </div>
                  {/if}

                  <div class="grid gap-1.5">
                    <Label for="background" class="text-xs">Background</Label>
                    <NativeSelect id="background" bind:value={background}>
                      {#each BACKGROUND_OPTIONS as b (b.value)}
                        <NativeSelectOption value={b.value}>
                          {b.label}
                        </NativeSelectOption>
                      {/each}
                    </NativeSelect>
                  </div>

                  <div class="grid gap-1.5">
                    <Label for="samplesPerModel" class="text-xs">
                      Generations / model
                    </Label>
                    <Input
                      id="samplesPerModel"
                      type="number"
                      min={1}
                      max={samplesMax}
                      step={1}
                      bind:value={samplesPerModel}
                    />
                    <p class="text-muted-foreground text-xs">
                      max {samplesMax}
                    </p>
                  </div>
                </div>

                <div class="grid gap-2 border-t pt-3">
                  <Label for="negativePrompt" class="text-xs">
                    Negative prompt (optional)
                  </Label>
                  <Textarea
                    id="negativePrompt"
                    placeholder="Things to avoid, e.g. text, watermarks…"
                    rows={2}
                    bind:value={negativePrompt}
                  />
                </div>

                <div class="grid gap-2 border-t pt-3">
                  <label class="flex items-center gap-2 text-sm">
                    <Checkbox bind:checked={enhance} />
                    Enhance prompt
                  </label>

                  {#if hasReferences && anySupportsReferences}
                    <label class="flex items-center gap-2 text-sm">
                      <Checkbox bind:checked={matchReferences} />
                      Match references closely
                    </label>
                  {/if}

                  {#if onViewBrandAssets}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      class="w-full"
                      disabled={!canViewBrandAssets}
                      title={canViewBrandAssets
                        ? "Browse this brand's assets to use as a reference"
                        : "Select a brand rule above to browse its assets"}
                      onclick={() => onViewBrandAssets?.()}
                    >
                      View brand assets
                    </Button>
                  {/if}
                </div>
              </div>
            </Popover.Content>
          </Popover.Root>

          <Button type="submit" disabled={!canSubmit}>
            {busy ? "Working…" : "Generate"}
          </Button>
        </div>
      </div>
    </div>

    {@render afterPrompt?.()}

    <input
      bind:this={fileInput}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      multiple
      class="hidden"
      onchange={handleFileSelect}
    />
  </form>

  <ModelSelectorDialog
    bind:open={modelDialogOpen}
    {config}
    bind:provider
    bind:selectedModels
  />
{/if}
