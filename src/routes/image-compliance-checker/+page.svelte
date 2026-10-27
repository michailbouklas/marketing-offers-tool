<script lang="ts">
  import { onDestroy } from "svelte";
  import { toast } from "svelte-sonner";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import ComplianceImageCard from "./ComplianceImageCard.svelte";
  import type { ImageEntry } from "./compliance-types";
  import { formatBrandLabel } from "$lib/services/brands";
  import { fetchBrandGuidelines } from "$lib/services/image-generator/image-generator-client";
  import {
    checkImageCompliance,
    fetchBrandComplianceRules,
  } from "$lib/services/image-compliance/image-compliance-client";
  import {
    ALLOWED_IMAGE_MIME,
    fileDedupeKey,
    isAllowedImageMime,
    MAX_FILES,
    MAX_RULES_CHARS,
    MAX_IMAGE_BYTES,
    MAX_IN_FLIGHT,
  } from "$lib/services/image-compliance/image-compliance";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let selectedBrandId = $state<number | null>(null);
  let rules = $state("");
  let rulesDirty = $state(false);
  let rulesLoading = $state(false);
  let entries = $state<ImageEntry[]>([]);
  let now = $state(Date.now());
  let dragActive = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);
  let switchDialogOpen = $state(false);
  let pendingBrandId = $state<number | null>(null);

  const rulesCache = new Map<number, string>();
  let rulesLoadToken = 0;

  const anyRunning = $derived(entries.some((e) => e.status === "running"));
  const queuedCount = $derived(
    entries.filter((e) => e.status === "queued").length,
  );
  const blockingReason = $derived.by(() => {
    if (selectedBrandId === null) return "Select a brand first.";
    if (rulesLoading) return "Loading compliance rules…";
    if (rules.trim().length === 0) {
      return "No compliance rules saved for this brand. Ask an admin to add them on the brand page, paste rules here, or start from the generation guidelines.";
    }
    if (rules.length > MAX_RULES_CHARS) {
      return `Compliance rules exceed ${MAX_RULES_CHARS.toLocaleString()} characters.`;
    }
    if (entries.length === 0) return "Add at least one image.";
    if (!anyRunning && queuedCount === 0) {
      return "All images are checked. Reset to check new ones.";
    }
    return null;
  });
  const canCheck = $derived(
    !anyRunning && queuedCount > 0 && blockingReason === null,
  );

  const selectedBrandName = $derived(
    data.brands.find((brand) => brand.id === selectedBrandId)?.name ?? null,
  );

  // One ticker for every card; only runs while something is in flight.
  $effect(() => {
    if (!anyRunning) return;
    const handle = setInterval(() => {
      now = Date.now();
    }, 250);
    return () => clearInterval(handle);
  });

  onDestroy(() => {
    cancelAll();
    for (const entry of entries) URL.revokeObjectURL(entry.objectUrl);
  });

  // ----- brand + rules -------------------------------------------------

  function selectBrand(brandId: number) {
    if (anyRunning) return;
    const next = selectedBrandId === brandId ? null : brandId;
    if (next === selectedBrandId) return;
    if (rulesDirty && rules.trim().length > 0) {
      pendingBrandId = next;
      switchDialogOpen = true;
      return;
    }
    applyBrand(next);
  }

  function confirmBrandSwitch() {
    switchDialogOpen = false;
    applyBrand(pendingBrandId);
    pendingBrandId = null;
  }

  function applyBrand(next: number | null) {
    selectedBrandId = next;
    rulesDirty = false;
    requeueFinished();
    if (next === null) {
      rules = "";
      rulesLoading = false;
      return;
    }
    void loadBrandRules(next);
  }

  async function loadBrandRules(brandId: number) {
    const token = ++rulesLoadToken;
    const cached = rulesCache.get(brandId);
    if (cached !== undefined) {
      rules = cached;
      rulesLoading = false;
      return;
    }
    rules = "";
    rulesLoading = true;
    try {
      const markdown = await fetchBrandComplianceRules(brandId);
      rulesCache.set(brandId, markdown);
      if (token === rulesLoadToken && selectedBrandId === brandId) {
        rules = markdown;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      if (token === rulesLoadToken) {
        rulesLoading = false;
      }
    }
  }

  let seeding = $state(false);

  /** Per-run convenience: copy the brand's generation guidelines into the box. */
  async function seedFromGuidelines() {
    if (selectedBrandId === null || seeding) return;
    seeding = true;
    try {
      const markdown = (await fetchBrandGuidelines(selectedBrandId)).trim();
      if (!markdown) {
        toast.info(
          "This brand has no generation guidelines to start from either.",
        );
        return;
      }
      rules = markdown;
      rulesDirty = true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      seeding = false;
    }
  }

  /** Old verdicts referred to the previous brand's rules; put them back in the queue. */
  function requeueFinished() {
    let changed = false;
    for (const entry of entries) {
      if (entry.status === "running" || entry.status === "queued") continue;
      Object.assign(entry, {
        status: "queued",
        step: null,
        startedAt: null,
        finishedAt: null,
        result: null,
        error: null,
        controller: null,
      } satisfies Partial<ImageEntry>);
      changed = true;
    }
    if (changed) {
      toast.info("Previous results were cleared because the brand changed.");
    }
  }

  // ----- files -------------------------------------------------------------

  function addFiles(list: FileList | File[] | null | undefined) {
    if (!list) return;
    const existing = new Set(entries.map((e) => fileDedupeKey(e.file)));
    const added: ImageEntry[] = [];
    let skippedType = 0;
    let skippedSize = 0;
    let skippedDuplicate = 0;
    let skippedCap = 0;

    for (const file of Array.from(list)) {
      if (!isAllowedImageMime(file.type.toLowerCase())) {
        skippedType += 1;
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        skippedSize += 1;
        continue;
      }
      const key = fileDedupeKey(file);
      if (existing.has(key)) {
        skippedDuplicate += 1;
        continue;
      }
      if (entries.length + added.length >= MAX_FILES) {
        skippedCap += 1;
        continue;
      }
      existing.add(key);
      added.push({
        id: crypto.randomUUID(),
        file,
        objectUrl: URL.createObjectURL(file),
        status: "queued",
        step: null,
        startedAt: null,
        finishedAt: null,
        result: null,
        error: null,
        controller: null,
      });
    }

    if (added.length > 0) {
      entries = [...entries, ...added];
    }
    if (skippedType > 0) {
      toast.error(
        `${skippedType} file${skippedType === 1 ? " is" : "s are"} not PNG, JPEG or WebP (HEIC must be exported first).`,
      );
    }
    if (skippedSize > 0) {
      toast.error(
        `${skippedSize} file${skippedSize === 1 ? " is" : "s are"} larger than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`,
      );
    }
    if (skippedDuplicate > 0) {
      toast.info(
        `Skipped ${skippedDuplicate} duplicate file${skippedDuplicate === 1 ? "" : "s"}.`,
      );
    }
    if (skippedCap > 0) {
      toast.error(`At most ${MAX_FILES} images per batch.`);
    }
  }

  function removeEntry(id: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry || entry.status === "running") return;
    URL.revokeObjectURL(entry.objectUrl);
    entries = entries.filter((e) => e.id !== id);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragActive = false;
    if (anyRunning) return;
    addFiles(event.dataTransfer?.files);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (!anyRunning) dragActive = true;
  }

  function handleDragLeave(event: DragEvent) {
    // Ignore leave events fired when moving between the zone's children.
    if (
      event.currentTarget instanceof HTMLElement &&
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    dragActive = false;
  }

  function openFilePicker() {
    if (anyRunning) return;
    fileInput?.click();
  }

  function handleZoneKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  }

  // ----- checks ------------------------------------------------------------

  function patch(id: string, changes: Partial<ImageEntry>) {
    const entry = entries.find((e) => e.id === id);
    if (entry) Object.assign(entry, changes);
  }

  async function runChecks() {
    if (!canCheck || selectedBrandId === null) return;
    const brandId = selectedBrandId;
    const rulesText = rules.trim();
    const queue = entries.filter((e) => e.status === "queued").map((e) => e.id);

    const workers = Array.from(
      { length: Math.min(MAX_IN_FLIGHT, queue.length) },
      async () => {
        for (;;) {
          const id = queue.shift();
          if (id === undefined) return;
          await runOne(id, brandId, rulesText);
        }
      },
    );
    await Promise.all(workers);
  }

  async function runOne(id: string, brandId: number, rules: string) {
    const entry = entries.find((e) => e.id === id);
    if (!entry || entry.status !== "queued") return;

    const controller = new AbortController();
    patch(id, {
      status: "running",
      step: null,
      startedAt: Date.now(),
      finishedAt: null,
      result: null,
      error: null,
      controller,
    });

    try {
      const result = await checkImageCompliance(
        entry.file,
        { brandId, rules },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "step-start") {
              patch(id, { step: event.step });
            }
          },
        },
      );
      patch(id, {
        status: "done",
        result,
        finishedAt: Date.now(),
        controller: null,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        patch(id, {
          status: "cancelled",
          finishedAt: Date.now(),
          controller: null,
        });
        return;
      }
      patch(id, {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        finishedAt: Date.now(),
        controller: null,
      });
    }
  }

  function retryEntry(id: string) {
    patch(id, {
      status: "queued",
      step: null,
      startedAt: null,
      finishedAt: null,
      result: null,
      error: null,
      controller: null,
    });
    if (!anyRunning) {
      void runChecks();
    }
  }

  function cancelAll() {
    for (const entry of entries) {
      entry.controller?.abort();
    }
  }

  function reset() {
    if (anyRunning) return;
    for (const entry of entries) URL.revokeObjectURL(entry.objectUrl);
    entries = [];
  }
</script>

<svelte:head>
  <title>Image Compliance Checker</title>
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">
        Image Compliance Checker
      </h1>
      <p class="text-muted-foreground text-sm">
        Check creatives against a brand's compliance rules before they ship.
      </p>
    </div>
    <Button href="/image-generator" variant="outline" size="sm">
      Back to Image Generator
    </Button>
  </div>

  <section class="space-y-2">
    <p class="text-sm font-medium">Brand</p>
    {#if data.brands.length > 0}
      <ButtonGroup.Root class="flex max-w-full flex-wrap" aria-label="Brand">
        {#each data.brands as brand (brand.id)}
          <Button
            variant={selectedBrandId === brand.id ? "default" : "outline"}
            size="sm"
            type="button"
            aria-pressed={selectedBrandId === brand.id}
            disabled={anyRunning}
            onclick={() => selectBrand(brand.id)}
          >
            {formatBrandLabel(brand)}
          </Button>
        {/each}
      </ButtonGroup.Root>
    {:else}
      <p class="text-muted-foreground text-sm">
        No active brands are assigned to your account.
      </p>
    {/if}
  </section>

  {#if selectedBrandId !== null}
    <section class="space-y-2">
      <Label for="compliance-rules">Compliance rules</Label>
      <Textarea
        id="compliance-rules"
        bind:value={rules}
        oninput={() => (rulesDirty = true)}
        disabled={anyRunning || rulesLoading}
        placeholder={rulesLoading
          ? "Loading rules…"
          : "No compliance rules saved for this brand. Paste the rules the images must follow, or start from the generation guidelines below."}
        class="field-sizing-fixed h-64 resize-none overflow-y-auto font-mono text-xs"
      />
      <p class="text-muted-foreground text-xs">
        {#if rulesLoading}
          Loading rules…
        {:else}
          Edits apply to this check only; they are not saved to the brand.
        {/if}
      </p>
      {#if !rulesLoading && rules.trim().length === 0}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={seeding || anyRunning}
          onclick={seedFromGuidelines}
        >
          {seeding ? "Loading…" : "Start from generation guidelines"}
        </Button>
      {/if}
    </section>
  {/if}

  <section class="space-y-3">
    <div
      role="button"
      tabindex="0"
      aria-label="Add images"
      aria-disabled={anyRunning}
      class="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 text-center text-sm transition-colors {dragActive
        ? 'border-primary bg-primary/5'
        : 'border-border'} {anyRunning
        ? 'cursor-not-allowed opacity-60'
        : 'hover:bg-muted/50 cursor-pointer'}"
      onclick={openFilePicker}
      onkeydown={handleZoneKeydown}
      ondragenter={handleDragOver}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
    >
      <UploadIcon class="text-muted-foreground size-6" />
      <p class="font-medium">Drop images here or click to browse</p>
      <p class="text-muted-foreground text-xs">
        PNG, JPEG or WebP · up to {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB each
        · max {MAX_FILES} per batch
      </p>
    </div>
    <input
      bind:this={fileInput}
      type="file"
      multiple
      accept={ALLOWED_IMAGE_MIME.join(",")}
      class="hidden"
      onchange={(event) => {
        addFiles(event.currentTarget.files);
        event.currentTarget.value = "";
      }}
    />

    <div class="flex flex-wrap items-center gap-2">
      <Button type="button" disabled={!canCheck} onclick={runChecks}>
        {#if anyRunning}
          <LoaderCircleIcon class="animate-spin" />
          Checking…
        {:else if queuedCount === 0}
          Check images
        {:else if queuedCount === 1}
          Check image
        {:else}
          Check {queuedCount} images
        {/if}
      </Button>
      {#if anyRunning}
        <Button type="button" variant="outline" onclick={cancelAll}>
          Cancel
        </Button>
      {/if}
      {#if entries.length > 0 && !anyRunning}
        <Button type="button" variant="ghost" onclick={reset}>Reset</Button>
      {/if}
      {#if blockingReason}
        <p class="text-muted-foreground text-sm">{blockingReason}</p>
      {/if}
    </div>

    {#if entries.length > 0}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each entries as entry (entry.id)}
          <ComplianceImageCard
            {entry}
            {now}
            brandName={selectedBrandName}
            onRemove={removeEntry}
            onRetry={retryEntry}
          />
        {/each}
      </div>
    {/if}
  </section>
</main>

<AlertDialog.Root bind:open={switchDialogOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Discard edited compliance rules?</AlertDialog.Title>
      <AlertDialog.Description>
        You edited the rules text. Switching brand replaces it with the selected
        brand's stored rules.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={() => (pendingBrandId = null)}>
        Keep editing
      </AlertDialog.Cancel>
      <AlertDialog.Action onclick={confirmBrandSwitch}>
        Switch brand
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
