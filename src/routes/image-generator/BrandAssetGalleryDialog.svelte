<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { cn } from "$lib/utils.js";
  import CheckIcon from "@lucide/svelte/icons/check";
  import type { BrandAssetDTO } from "$lib/services/image-generator/image-generator-client";

  interface Props {
    open: boolean;
    brandName: string | null;
    assets: BrandAssetDTO[] | null;
    loading: boolean;
    onOpenChange: (open: boolean) => void;
    onUseAsReferences: (assets: BrandAssetDTO[]) => void | Promise<void>;
  }

  let {
    open,
    brandName,
    assets,
    loading,
    onOpenChange,
    onUseAsReferences,
  }: Props = $props();

  let selectedIds = $state<string[]>([]);
  let busy = $state(false);

  // Each time the dialog closes, start the next session with a clean selection.
  $effect(() => {
    if (!open) {
      selectedIds = [];
      busy = false;
    }
  });

  function isSelected(id: string): boolean {
    return selectedIds.includes(id);
  }

  function toggle(id: string) {
    selectedIds = isSelected(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
  }

  async function confirm() {
    if (busy || selectedIds.length === 0 || !assets) return;
    const chosen = assets.filter((a) => selectedIds.includes(a.id));
    busy = true;
    try {
      await onUseAsReferences(chosen);
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

    {#if loading}
      <p class="text-muted-foreground py-6 text-center text-sm">
        Loading assets…
      </p>
    {:else if !assets || assets.length === 0}
      <p class="text-muted-foreground py-6 text-center text-sm">
        No brand assets available for this brand.
      </p>
    {:else}
      <div
        class="grid max-h-[70vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
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
            onclick={() => toggle(asset.id)}
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
              alt={asset.name}
              class="bg-muted h-40 w-full rounded object-contain"
              loading="lazy"
            />
            <p class="truncate text-sm font-medium" title={asset.name}>
              {asset.name}
            </p>
          </button>
        {/each}
      </div>

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
          disabled={busy || selectedIds.length === 0}
          onclick={confirm}
        >
          {#if busy}
            Attaching…
          {:else if selectedIds.length > 0}
            Use {selectedIds.length} as reference{selectedIds.length === 1
              ? ""
              : "s"}
          {:else}
            Use as reference
          {/if}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
