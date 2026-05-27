<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "$lib/components/ui/native-select/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import type { Snippet } from "svelte";
  import type {
    ImageGeneratorConfig,
    ImageProviderId,
  } from "$lib/services/image-providers/config";
  import {
    ASPECT_RATIOS,
    CAMERAS,
    STYLES,
    type AspectRatio,
    type Camera,
    type ComposerState,
    type Style,
    type SubmitPayload,
  } from "./composer-types";

  interface Props {
    config: ImageGeneratorConfig;
    busy?: boolean;
    initial?: Partial<ComposerState> | null;
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
    config.defaultModel ?? config.providers[0]?.models[0] ?? "gpt-image-1",
  );

  let prompt = $state("");
  let provider = $state<ImageProviderId>("imagerouter");
  let model = $state("");
  let size = $state("1024x1024");
  let style = $state<Style>("none");
  let camera = $state<Camera>("none");
  let aspectRatio = $state<AspectRatio>("none");
  let enhance = $state(true);
  let allModels = $state(false);
  let samplesPerModel = $state(1);
  let referenceFiles = $state<File[]>([]);
  let preUploadedReferenceIds = $state<string[]>([]);
  let guidelinesText = $state("");
  let showGuidelines = $state(false);
  let didInit = $state(false);

  // Keep the editable guidelines in sync with the selected brand. Editing the
  // textarea detaches from this until a different brand's guidelines arrive.
  let lastBrandGuidelines = $state<string | null>(null);
  $effect(() => {
    if (brandGuidelines !== lastBrandGuidelines) {
      lastBrandGuidelines = brandGuidelines;
      guidelinesText = brandGuidelines ?? "";
      if (!brandGuidelines) showGuidelines = false;
    }
  });

  const hasBrandGuidelines = $derived(
    typeof brandGuidelines === "string" && brandGuidelines.trim().length > 0,
  );

  $effect(() => {
    if (didInit) return;
    didInit = true;
    prompt = initial?.prompt ?? "";
    provider = (initial?.provider as ImageProviderId) ?? defaultProvider;
    model = initial?.model ?? defaultModel;
    size = initial?.size ?? "1024x1024";
    style = initial?.style ?? "none";
    camera = initial?.camera ?? "none";
    aspectRatio = initial?.aspectRatio ?? "none";
    enhance = initial?.enhance ?? true;
    allModels = initial?.allModels ?? false;
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

  $effect(() => {
    if (providerModels.length > 0 && !providerModels.includes(model)) {
      model = providerModels[0]!;
    }
  });

  const effectiveSize = $derived.by(() => {
    if (aspectRatio === "square") return "1024x1024";
    if (aspectRatio === "widescreen") return "1536x1024";
    if (aspectRatio === "tiktok") return "1024x1536";
    return size;
  });

  const canSubmit = $derived(
    prompt.trim().length > 0 && providerModels.length > 0 && !busy,
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
      model,
      size: effectiveSize,
      style,
      camera,
      aspectRatio,
      enhance,
      allModels,
      samplesPerModel,
      referenceIds,
      referenceFiles,
      brandGuidelines: hasBrandGuidelines ? guidelinesText : undefined,
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
    if (state.model) model = state.model;
    if (state.size) size = state.size;
    if (state.style) style = state.style;
    if (state.camera) camera = state.camera;
    if (state.aspectRatio) aspectRatio = state.aspectRatio;
    if (state.enhance !== undefined) enhance = state.enhance;
    if (state.allModels !== undefined) allModels = state.allModels;
    if (state.samplesPerModel !== undefined)
      samplesPerModel = state.samplesPerModel;
    if (state.referenceIds) preUploadedReferenceIds = state.referenceIds;
  }
</script>

<Card>
  <CardHeader>
    <CardTitle>Compose a prompt</CardTitle>
  </CardHeader>
  <CardContent>
    {#if config.providers.length === 0}
      <p class="text-muted-foreground text-sm">
        No image providers are configured. Set <code>IMAGE_ROUTER_API_KEY</code>
        or <code>OPENAI_API_KEY</code> in your environment to enable generation.
      </p>
    {:else}
      <form class="grid gap-4" onsubmit={handleSubmit}>
        <div class="grid gap-2">
          <Label for="prompt">Prompt</Label>
          <Textarea
            id="prompt"
            placeholder="Describe the image you want…"
            rows={4}
            bind:value={prompt}
          />
        </div>

        {@render afterPrompt?.()}

        {#if hasBrandGuidelines}
          <div class="grid gap-2">
            <div class="flex items-center justify-between">
              <Label for="brandGuidelines">Brand guidelines</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onclick={() => (showGuidelines = !showGuidelines)}
              >
                {showGuidelines ? "Hide" : "Edit guidelines"}
              </Button>
            </div>
            {#if showGuidelines}
              <Textarea
                id="brandGuidelines"
                rows={5}
                bind:value={guidelinesText}
              />
              <p class="text-muted-foreground text-xs">
                Prepended to the prompt for this brand. Edits apply to this
                session's generations only and are not saved back to the brand.
              </p>
            {:else}
              <p class="text-muted-foreground text-xs">
                This brand's guidelines will be applied. Click "Edit guidelines"
                to review or tweak them for this generation.
              </p>
            {/if}
          </div>
        {/if}

        <div class="grid gap-3 sm:grid-cols-2">
          <div class="grid gap-2">
            <Label for="provider">Provider</Label>
            <NativeSelect id="provider" bind:value={provider}>
              {#each config.providers as p (p.id)}
                <NativeSelectOption value={p.id}>{p.id}</NativeSelectOption>
              {/each}
            </NativeSelect>
          </div>

          <div class="grid gap-2">
            <Label for="model">Model</Label>
            <NativeSelect id="model" bind:value={model}>
              {#each providerModels as m (m)}
                <NativeSelectOption value={m}>{m}</NativeSelectOption>
              {/each}
            </NativeSelect>
          </div>

          <div class="grid gap-2">
            <Label for="size">Image size</Label>
            <NativeSelect
              id="size"
              bind:value={size}
              disabled={aspectRatio !== "none"}
            >
              <NativeSelectOption value="1024x1024"
                >1024×1024</NativeSelectOption
              >
              <NativeSelectOption value="1536x1024"
                >1536×1024</NativeSelectOption
              >
              <NativeSelectOption value="1024x1536"
                >1024×1536</NativeSelectOption
              >
            </NativeSelect>
            {#if aspectRatio !== "none"}
              <p class="text-muted-foreground text-xs">
                Overridden by aspect ratio → <code>{effectiveSize}</code>
              </p>
            {/if}
          </div>

          <div class="grid gap-2">
            <Label for="aspectRatio">Aspect ratio</Label>
            <NativeSelect id="aspectRatio" bind:value={aspectRatio}>
              {#each ASPECT_RATIOS as a (a.value)}
                <NativeSelectOption value={a.value}
                  >{a.label}</NativeSelectOption
                >
              {/each}
            </NativeSelect>
          </div>

          <div class="grid gap-2">
            <Label for="style">Style</Label>
            <NativeSelect id="style" bind:value={style}>
              {#each STYLES as s (s)}
                <NativeSelectOption value={s}>{s}</NativeSelectOption>
              {/each}
            </NativeSelect>
          </div>

          <div class="grid gap-2">
            <Label for="camera">Camera</Label>
            <NativeSelect id="camera" bind:value={camera}>
              {#each CAMERAS as c (c)}
                <NativeSelectOption value={c}>{c}</NativeSelectOption>
              {/each}
            </NativeSelect>
          </div>
        </div>

        <div class="grid gap-2">
          <div class="flex items-center justify-between gap-2">
            <Label for="references">Reference images (optional)</Label>
            {#if onViewBrandAssets}
              <Button
                type="button"
                variant="outline"
                size="sm"
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
          <input
            id="references"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            class="text-sm"
            onchange={handleFileSelect}
          />
          {#if preUploadedReferenceIds.length > 0}
            <div class="flex flex-wrap gap-2">
              {#each preUploadedReferenceIds as refId (refId)}
                <div
                  class="border-input bg-muted relative size-16 overflow-hidden rounded-md border"
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
        </div>

        <div class="flex flex-wrap items-center gap-6">
          <label class="flex items-center gap-2 text-sm">
            <Checkbox bind:checked={enhance} />
            Enhance prompt
          </label>

          <label class="flex items-center gap-2 text-sm">
            <Checkbox bind:checked={allModels} />
            All models
          </label>

          <div class="flex items-center gap-2">
            <Label for="samplesPerModel" class="text-sm">Samples / model</Label>
            <Input
              id="samplesPerModel"
              type="number"
              min={1}
              max={samplesMax}
              step={1}
              class="w-20"
              bind:value={samplesPerModel}
            />
            <span class="text-muted-foreground text-xs">max {samplesMax}</span>
          </div>
        </div>

        <div>
          <Button type="submit" disabled={!canSubmit}>
            {busy ? "Working…" : "Generate"}
          </Button>
        </div>
      </form>
    {/if}
  </CardContent>
</Card>
