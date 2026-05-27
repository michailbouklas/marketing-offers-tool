<script lang="ts">
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card/index.js";
  import BrandAssetGalleryDialog from "./BrandAssetGalleryDialog.svelte";
  import ImageGrid from "./ImageGrid.svelte";
  import PromptComposer from "./PromptComposer.svelte";
  import { formatBrandLabel } from "$lib/services/brands";
  import type { ComposerState, SubmitPayload } from "./composer-types";
  import type { GeneratedImageDTO } from "$lib/services/image-generator/image-generator";
  import {
    attachBrandAssetAsReference,
    enhancePrompt,
    fetchBrandGuidelines,
    fetchImagesSince,
    listBrandAssets,
    submitGeneration,
    uploadReferences,
    type BrandAssetDTO,
  } from "$lib/services/image-generator/image-generator-client";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let items = $state<GeneratedImageDTO[]>(data.images);
  let busy = $state(false);
  let pendingClarification = $state<string[] | null>(null);
  let pendingPrompt = $state<string | null>(null);
  let pendingAnswerForm = $state("");
  let composer: { loadFrom: (s: Partial<ComposerState>) => void } | undefined =
    $state();
  let suppressEnhanceOnce = $state(false);
  let elapsedById = $state<Record<string, number>>({});

  let selectedBrandId = $state<number | null>(null);
  let galleryOpen = $state(false);
  let galleryLoading = $state(false);
  let galleryAssets = $state<BrandAssetDTO[] | null>(null);
  let selectedBrandGuidelines = $state<string | null>(null);
  const assetCache = new Map<number, BrandAssetDTO[]>();
  const guidelinesCache = new Map<number, string>();

  const selectedBrand = $derived(
    selectedBrandId === null
      ? null
      : (data.brands.find((b) => b.id === selectedBrandId) ?? null),
  );

  let pollHandle: ReturnType<typeof setInterval> | null = null;
  let elapsedHandle: ReturnType<typeof setInterval> | null = null;
  let pendingStartedAt: Record<string, number> = {};

  function hasPending(): boolean {
    return items.some((i) => i.status === "pending");
  }

  function trackPending(rows: GeneratedImageDTO[]) {
    const now = Date.now();
    for (const row of rows) {
      if (row.status === "pending" && !(row.id in pendingStartedAt)) {
        pendingStartedAt[row.id] = now;
        elapsedById = { ...elapsedById, [row.id]: 0 };
      }
    }
  }

  function ensurePollers() {
    if (!pollHandle && hasPending()) {
      pollHandle = setInterval(refresh, 2000);
    }
    if (!elapsedHandle && hasPending()) {
      elapsedHandle = setInterval(() => {
        const now = Date.now();
        const next: Record<string, number> = {};
        for (const [id, start] of Object.entries(pendingStartedAt)) {
          next[id] = now - start;
        }
        elapsedById = next;
      }, 100);
    }
  }

  function stopPollersIfQuiet() {
    if (!hasPending()) {
      if (pollHandle) {
        clearInterval(pollHandle);
        pollHandle = null;
      }
      if (elapsedHandle) {
        clearInterval(elapsedHandle);
        elapsedHandle = null;
      }
      pendingStartedAt = {};
    }
  }

  async function refresh() {
    const pendingRows = items.filter((item) => item.status === "pending");
    const since =
      pendingRows.length > 0
        ? pendingRows[pendingRows.length - 1]!.createdAt
        : (items[0]?.createdAt ?? null);

    try {
      const { items: fresh } = await fetchImagesSince(since);
      mergeRows(fresh);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  function mergeRows(fresh: GeneratedImageDTO[]) {
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const row of fresh) {
      byId.set(row.id, row);
    }
    items = Array.from(byId.values()).sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
    trackPending(items);
    stopPollersIfQuiet();
  }

  async function handleSubmit(payload: SubmitPayload) {
    if (busy) return;
    busy = true;
    try {
      let promptToSend = payload.prompt;
      let referenceIds = payload.referenceIds;

      const shouldEnhance =
        payload.enhance && referenceIds.length === 0 && !suppressEnhanceOnce;

      if (shouldEnhance) {
        const result = await enhancePrompt(payload.prompt);
        if (result.clarifyingQuestions?.length) {
          pendingClarification = result.clarifyingQuestions;
          pendingPrompt = payload.prompt;
          return;
        }
        if (result.enhancedPrompt) {
          promptToSend = result.enhancedPrompt;
        }
      }

      suppressEnhanceOnce = false;

      const { items: created } = await submitGeneration({
        prompt: promptToSend,
        provider: payload.provider,
        model: payload.allModels ? undefined : payload.model,
        size: payload.size,
        style: payload.style === "none" ? undefined : payload.style,
        camera: payload.camera === "none" ? undefined : payload.camera,
        aspectRatio:
          payload.aspectRatio === "none" ? undefined : payload.aspectRatio,
        references: referenceIds.length > 0 ? referenceIds : undefined,
        brandId: selectedBrandId ?? undefined,
        brandGuidelines:
          selectedBrandId !== null ? payload.brandGuidelines : undefined,
        allModels: payload.allModels,
        samplesPerModel: payload.samplesPerModel,
      });
      mergeRows(created);
      ensurePollers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function handleUploadReferences(files: File[]): Promise<string[]> {
    const result = await uploadReferences(files);
    return result.map((r) => r.id);
  }

  async function submitWithClarifications() {
    if (!pendingPrompt) return;
    const merged = `${pendingPrompt}\n\nClarifications: ${pendingAnswerForm}`;
    pendingClarification = null;
    pendingPrompt = null;
    pendingAnswerForm = "";
    busy = true;
    try {
      const result = await enhancePrompt(merged);
      const toSend = result.enhancedPrompt ?? merged;
      const { items: created } = await submitGeneration({
        prompt: toSend,
        provider: data.config.defaultProvider ?? "imagerouter",
      });
      mergeRows(created);
      ensurePollers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  function skipClarifications() {
    if (!pendingPrompt) return;
    const promptToSend = pendingPrompt;
    pendingClarification = null;
    pendingPrompt = null;
    pendingAnswerForm = "";
    void submitGeneration({
      prompt: promptToSend,
      provider: data.config.defaultProvider ?? "imagerouter",
    })
      .then(({ items: created }) => {
        mergeRows(created);
        ensurePollers();
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : String(err)),
      );
  }

  function handleReprompt(item: GeneratedImageDTO) {
    composer?.loadFrom({
      prompt: item.prompt,
      model: item.model ?? undefined,
      size: `${item.requestedWidth}x${item.requestedHeight}`,
      style: (item.style ?? "none") as ComposerState["style"],
      camera: (item.camera ?? "none") as ComposerState["camera"],
      aspectRatio: (item.aspectRatio ?? "none") as ComposerState["aspectRatio"],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEditWithReference(item: GeneratedImageDTO) {
    composer?.loadFrom({
      prompt: item.prompt,
      referenceIds: [item.id],
      enhance: false,
    });
    suppressEnhanceOnce = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectBrand(brandId: number) {
    const next = selectedBrandId === brandId ? null : brandId;
    selectedBrandId = next;
    if (next === null) {
      selectedBrandGuidelines = null;
      return;
    }
    void loadBrandGuidelines(next);
  }

  async function loadBrandGuidelines(brandId: number) {
    const cached = guidelinesCache.get(brandId);
    if (cached !== undefined) {
      selectedBrandGuidelines = cached;
      return;
    }
    try {
      const markdown = await fetchBrandGuidelines(brandId);
      guidelinesCache.set(brandId, markdown);
      if (selectedBrandId === brandId) {
        selectedBrandGuidelines = markdown;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function openBrandGallery() {
    if (selectedBrandId === null) return;
    const brandId = selectedBrandId;
    galleryOpen = true;

    const cached = assetCache.get(brandId);
    if (cached) {
      galleryAssets = cached;
      galleryLoading = false;
      return;
    }

    galleryLoading = true;
    galleryAssets = null;
    try {
      const fetched = await listBrandAssets(brandId);
      assetCache.set(brandId, fetched);
      if (selectedBrandId === brandId && galleryOpen) {
        galleryAssets = fetched;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      galleryOpen = false;
    } finally {
      galleryLoading = false;
    }
  }

  function handleGalleryOpenChange(open: boolean) {
    galleryOpen = open;
    if (!open) {
      galleryAssets = null;
    }
  }

  async function attachBrandAsset(asset: BrandAssetDTO) {
    try {
      const ref = await attachBrandAssetAsReference(asset.id);
      composer?.loadFrom({ referenceIds: [ref.id], enhance: false });
      suppressEnhanceOnce = true;
      galleryOpen = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  onMount(() => {
    trackPending(items);
    if (hasPending()) ensurePollers();

    return () => {
      if (pollHandle) clearInterval(pollHandle);
      if (elapsedHandle) clearInterval(elapsedHandle);
    };
  });
</script>

<svelte:head>
  <title>Image Generator</title>
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
  <div class="space-y-1">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">Image Generator</h1>
        <p class="text-muted-foreground text-sm">
          Generate images from prompts using configured AI providers.
        </p>
      </div>
      <Button href="/image-generator/me" variant="outline" size="sm">
        My generated images
      </Button>
    </div>
    <div class="space-y-2 pt-3">
      <p class="text-sm font-medium">Available brand rules</p>
      {#if data.brands.length > 0}
        <div class="flex flex-wrap items-center gap-2">
          <ButtonGroup.Root
            class="flex max-w-full flex-wrap"
            aria-label="Available brand rules"
          >
            {#each data.brands as brand (brand.id)}
              <Button
                variant={selectedBrandId === brand.id ? "default" : "outline"}
                size="sm"
                type="button"
                aria-pressed={selectedBrandId === brand.id}
                onclick={() => selectBrand(brand.id)}
              >
                {formatBrandLabel(brand)}
              </Button>
            {/each}
          </ButtonGroup.Root>
          <Button
            variant={selectedBrandId === null ? "secondary" : "default"}
            size="sm"
            type="button"
            disabled={selectedBrandId === null}
            onclick={openBrandGallery}
          >
            View brand assets
          </Button>
        </div>
      {:else}
        <p class="text-muted-foreground text-sm">
          No active brand rules are assigned to your account.
        </p>
      {/if}
    </div>
  </div>

  <PromptComposer
    bind:this={composer}
    config={data.config}
    {busy}
    brandGuidelines={selectedBrandGuidelines}
    onSubmit={handleSubmit}
    onUploadReferences={handleUploadReferences}
  />

  {#if pendingClarification}
    <Card>
      <CardHeader>
        <CardTitle>A few quick questions</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <ul class="list-disc space-y-1 pl-5 text-sm">
          {#each pendingClarification as q (q)}
            <li>{q}</li>
          {/each}
        </ul>
        <textarea
          class="border-input min-h-24 w-full rounded-md border bg-transparent p-2 text-sm"
          placeholder="Type your answers, or click Skip."
          bind:value={pendingAnswerForm}
        ></textarea>
        <div class="flex gap-2">
          <Button onclick={submitWithClarifications} disabled={busy}>
            Submit answers
          </Button>
          <Button variant="ghost" onclick={skipClarifications} disabled={busy}>
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  {/if}

  <ImageGrid
    {items}
    {elapsedById}
    onReprompt={handleReprompt}
    onEditWithReference={handleEditWithReference}
  />

  <BrandAssetGalleryDialog
    open={galleryOpen}
    brandName={selectedBrand ? formatBrandLabel(selectedBrand) : null}
    assets={galleryAssets}
    loading={galleryLoading}
    onOpenChange={handleGalleryOpenChange}
    onUseAsReference={attachBrandAsset}
  />
</main>
