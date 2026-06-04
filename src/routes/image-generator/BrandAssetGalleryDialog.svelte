<script lang="ts">
  import { toast } from "svelte-sonner";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { cn } from "$lib/utils.js";
  import CheckIcon from "@lucide/svelte/icons/check";
  import {
    listBrandAssets,
    type BrandAssetDTO,
  } from "$lib/services/image-generator/image-generator-client";

  interface Props {
    open: boolean;
    brandId: number | null;
    brandName: string | null;
    onOpenChange: (open: boolean) => void;
    onUseAsReferences: (assets: BrandAssetDTO[]) => void | Promise<void>;
  }

  let { open, brandId, brandName, onOpenChange, onUseAsReferences }: Props =
    $props();

  let assets = $state<BrandAssetDTO[] | null>(null);
  let total = $state(0);
  let page = $state(1);
  let pageSize = $state(50);
  let search = $state("");
  let loading = $state(false);
  // Selected assets are kept as full DTOs so selection survives page changes
  // and search filtering.
  let selected = $state<BrandAssetDTO[]>([]);
  let busy = $state(false);

  let requestToken = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

  // Each time the dialog opens, start a fresh session and load the first page.
  $effect(() => {
    if (open && brandId !== null) {
      search = "";
      page = 1;
      selected = [];
      busy = false;
      void loadAssets(1, "");
    }
    return () => {
      if (searchTimer) clearTimeout(searchTimer);
    };
  });

  async function loadAssets(targetPage: number, term: string) {
    if (brandId === null) return;
    const token = ++requestToken;
    loading = true;
    try {
      const result = await listBrandAssets(brandId, {
        search: term,
        page: targetPage,
      });
      if (token !== requestToken) return;
      assets = result.items;
      total = result.total;
      page = result.page;
      pageSize = result.pageSize;
    } catch (err) {
      if (token !== requestToken) return;
      toast.error(err instanceof Error ? err.message : String(err));
      onOpenChange(false);
    } finally {
      if (token === requestToken) loading = false;
    }
  }

  function handleSearchInput() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void loadAssets(1, search);
    }, 300);
  }

  function isSelected(id: string): boolean {
    return selected.some((asset) => asset.id === id);
  }

  function toggle(asset: BrandAssetDTO) {
    selected = isSelected(asset.id)
      ? selected.filter((existing) => existing.id !== asset.id)
      : [...selected, asset];
  }

  async function confirm() {
    if (busy || selected.length === 0) return;
    busy = true;
    try {
      await onUseAsReferences(selected);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root
  {open}
  onOpenChange={(value) => {
    onOpenChange(value);
  }}
>
  <Dialog.Content class="w-[80vw] max-w-[80vw] sm:max-w-[80vw]">
    <Dialog.Header>
      <Dialog.Title>
        Brand assets{brandName ? ` — ${brandName}` : ""}
      </Dialog.Title>
      <Dialog.Description>
        Select one or more assets to attach as references for the next
        generation.
      </Dialog.Description>
    </Dialog.Header>

    <Input
      type="search"
      placeholder="Search assets by name…"
      bind:value={search}
      oninput={handleSearchInput}
    />

    {#if loading && assets === null}
      <p class="text-muted-foreground py-6 text-center text-sm">
        Loading assets…
      </p>
    {:else if !assets || assets.length === 0}
      <p class="text-muted-foreground py-6 text-center text-sm">
        {search.trim()
          ? "No assets match your search."
          : "No brand assets available for this brand."}
      </p>
    {:else}
      <div
        class={cn(
          "grid max-h-[60vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
          loading && "pointer-events-none opacity-60",
        )}
      >
        {#each assets as asset (asset.id)}
          <button
            type="button"
            aria-pressed={isSelected(asset.id)}
            class={cn(
              "bg-card focus-visible:ring-ring relative grid gap-3 rounded-lg border p-3 text-left transition outline-none focus-visible:ring-2",
              isSelected(asset.id)
                ? "border-primary ring-primary/40 ring-2"
                : "border-border hover:border-primary/50",
            )}
            onclick={() => toggle(asset)}
          >
            <span
              class={cn(
                "absolute top-2 right-2 flex size-5 items-center justify-center rounded-md border",
                isSelected(asset.id)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-input bg-background/90",
              )}
              aria-hidden="true"
            >
              {#if isSelected(asset.id)}
                <CheckIcon class="size-3.5" />
              {/if}
            </span>
            <img
              src={`/api/brand-assets/${asset.id}`}
              alt={asset.displayName ?? asset.name}
              class="bg-muted h-40 w-full rounded object-contain"
              loading="lazy"
            />
            <p
              class="truncate text-sm font-medium"
              title={asset.displayName ?? asset.name}
            >
              {asset.displayName ?? asset.name}
            </p>
          </button>
        {/each}
      </div>
    {/if}

    {#if totalPages > 1}
      <div class="flex items-center justify-between">
        <p class="text-muted-foreground text-xs">
          Page {page} of {totalPages} — {total} asset{total === 1 ? "" : "s"}
        </p>
        <div class="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || page <= 1}
            onclick={() => loadAssets(page - 1, search)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || page >= totalPages}
            onclick={() => loadAssets(page + 1, search)}
          >
            Next
          </Button>
        </div>
      </div>
    {/if}

    <Dialog.Footer>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onclick={() => onOpenChange(false)}
      >
        Cancel
      </Button>
      <Button
        type="button"
        disabled={busy || selected.length === 0}
        onclick={confirm}
      >
        {#if busy}
          Attaching…
        {:else if selected.length > 0}
          Use {selected.length} as reference{selected.length === 1 ? "" : "s"}
        {:else}
          Use as reference
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
