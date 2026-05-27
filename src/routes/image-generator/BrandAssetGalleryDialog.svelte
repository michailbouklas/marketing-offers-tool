<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card/index.js";
  import type { BrandAssetDTO } from "$lib/services/image-generator/image-generator-client";

  interface Props {
    open: boolean;
    brandName: string | null;
    assets: BrandAssetDTO[] | null;
    loading: boolean;
    onOpenChange: (open: boolean) => void;
    onUseAsReference: (asset: BrandAssetDTO) => void | Promise<void>;
  }

  let {
    open,
    brandName,
    assets,
    loading,
    onOpenChange,
    onUseAsReference,
  }: Props = $props();

  let busyAssetId = $state<string | null>(null);

  async function handleUse(asset: BrandAssetDTO) {
    if (busyAssetId) return;
    busyAssetId = asset.id;
    try {
      await onUseAsReference(asset);
    } finally {
      busyAssetId = null;
    }
  }
</script>

<Dialog.Root
  {open}
  onOpenChange={(value) => {
    onOpenChange(value);
  }}
>
  <Dialog.Content class="max-w-3xl">
    <Dialog.Header>
      <Dialog.Title>
        Brand assets{brandName ? ` — ${brandName}` : ""}
      </Dialog.Title>
      <Dialog.Description>
        Pick an asset to attach as a reference for the next generation.
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
        class="grid max-h-[60vh] gap-3 overflow-y-auto sm:grid-cols-2 md:grid-cols-3"
      >
        {#each assets as asset (asset.id)}
          <Card>
            <CardHeader class="p-3">
              <CardTitle class="truncate text-sm" title={asset.name}>
                {asset.name}
              </CardTitle>
            </CardHeader>
            <CardContent class="space-y-2 p-3 pt-0">
              <img
                src={`/api/brand-assets/${asset.id}`}
                alt={asset.name}
                class="bg-muted h-32 w-full rounded object-contain"
                loading="lazy"
              />
              <Button
                type="button"
                size="sm"
                class="w-full"
                disabled={busyAssetId !== null}
                onclick={() => handleUse(asset)}
              >
                {busyAssetId === asset.id ? "Attaching…" : "Use as reference"}
              </Button>
            </CardContent>
          </Card>
        {/each}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
