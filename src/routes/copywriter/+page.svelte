<script lang="ts">
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import CopyComposer from "./CopyComposer.svelte";
  import CopyResultCard from "./CopyResultCard.svelte";
  import { formatBrandLabel } from "$lib/services/brands";
  import type { GeneratedCopyDTO } from "$lib/services/copywriter/copywriter";
  import {
    fetchBrandGuidelines,
    rateVariant,
    submitCopyGeneration,
  } from "$lib/services/copywriter/copywriter-client";
  import type { CopySubmitPayload } from "./composer-types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let items = $state<GeneratedCopyDTO[]>([]);
  let busy = $state(false);

  let selectedBrandId = $state<number | null>(null);
  let selectedBrandGuidelines = $state<string | null>(null);
  const guidelinesCache = new Map<number, string>();

  function selectBrand(brandId: number) {
    const next = selectedBrandId === brandId ? null : brandId;
    selectedBrandId = next;
    selectedBrandGuidelines = null;
    if (next !== null) {
      void loadBrandGuidelines(next);
    }
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

  async function handleSubmit(payload: CopySubmitPayload) {
    if (busy) return;
    busy = true;
    try {
      const { item } = await submitCopyGeneration({
        copyType: payload.copyType,
        channel: payload.channel,
        brief: payload.brief,
        tone: payload.tone.length > 0 ? payload.tone : undefined,
        variantCount: payload.variantCount,
        provider: "openai",
        brandId: selectedBrandId ?? undefined,
        brandGuidelines:
          selectedBrandId !== null ? payload.brandGuidelines : undefined,
        offerId: payload.offerId ?? undefined,
      });
      items = [item, ...items];
      if (item.status === "failed") {
        toast.error(item.errorMessage ?? "Copy generation failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function handleFeedback(
    item: GeneratedCopyDTO,
    variantIndex: number,
    feedback: { rating?: number | null; picked?: boolean },
  ) {
    try {
      const { item: updated } = await rateVariant(
        item.id,
        variantIndex,
        feedback,
      );
      items = items.map((existing) =>
        existing.id === updated.id ? updated : existing,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }
</script>

<svelte:head>
  <title>Copywriter</title>
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
  <div class="space-y-1">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">Copywriter</h1>
        <p class="text-muted-foreground text-sm">
          Generate bilingual (Greek/English) marketing copy for offers, social
          posts, push notifications, and banners.
        </p>
      </div>
      <Button href="/copywriter/me" variant="outline" size="sm">My copy</Button>
    </div>
    <div class="space-y-2 pt-3">
      <p class="text-sm font-medium">Available brand rules</p>
      {#if data.brands.length > 0}
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
      {:else}
        <p class="text-muted-foreground text-sm">
          No active brand rules are assigned to your account.
        </p>
      {/if}
    </div>
  </div>

  {#if !data.openAIConfigured}
    <p class="text-muted-foreground rounded-xl border p-4 text-sm">
      No text provider is configured. Set <code>OPENAI_API_KEY</code> in your environment
      to enable copy generation.
    </p>
  {:else}
    <CopyComposer
      {busy}
      brandSelected={selectedBrandId !== null}
      brandGuidelines={selectedBrandGuidelines}
      offers={data.offers}
      onSubmit={handleSubmit}
    />
  {/if}

  {#if items.length > 0}
    <section class="grid gap-4">
      {#each items as item (item.id)}
        <CopyResultCard
          {item}
          onFeedback={(variantIndex, feedback) =>
            handleFeedback(item, variantIndex, feedback)}
        />
      {/each}
    </section>
  {/if}
</main>
