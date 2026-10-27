<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";

  interface BrandAssetSummary {
    id: string;
    name: string;
    displayName: string | null;
    contentType: string;
    sizeBytes: number;
    createdAt: string;
  }

  interface Props {
    brandId: number;
    assets: BrandAssetSummary[];
  }

  let { brandId, assets }: Props = $props();

  let uploadInput = $state<HTMLInputElement | undefined>();
  let uploading = $state(false);
  let deletingId = $state<string | null>(null);
  let editingAsset = $state<{
    id: string;
    name: string;
    displayName: string | null;
  } | null>(null);
  let editName = $state("");
  let savingName = $state(false);

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  async function uploadFiles(files: FileList | File[]) {
    if (uploading) return;
    const arr = Array.from(files);
    if (arr.length === 0) return;
    uploading = true;
    try {
      const form = new FormData();
      for (const file of arr) {
        form.append("file", file);
      }
      const res = await fetch(`/api/admin/brands/${brandId}/assets`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Upload failed: ${res.status}`);
      }
      toast.success(
        `${arr.length} asset${arr.length === 1 ? "" : "s"} uploaded.`,
      );
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      uploading = false;
      if (uploadInput) uploadInput.value = "";
    }
  }

  function handleFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) void uploadFiles(input.files);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    if (!event.dataTransfer?.files) return;
    void uploadFiles(event.dataTransfer.files);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  function openEditDialog(asset: {
    id: string;
    name: string;
    displayName: string | null;
  }) {
    editingAsset = asset;
    editName = asset.displayName ?? "";
  }

  async function saveAssetName(event: SubmitEvent) {
    event.preventDefault();
    if (savingName || !editingAsset) return;
    savingName = true;
    try {
      const res = await fetch(
        `/api/admin/brands/${brandId}/assets/${editingAsset.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: editName }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Save failed: ${res.status}`);
      }
      toast.success("Asset name saved.");
      editingAsset = null;
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      savingName = false;
    }
  }

  async function deleteAsset(assetId: string) {
    if (deletingId) return;
    if (!confirm("Delete this brand asset? This cannot be undone.")) return;
    deletingId = assetId;
    try {
      const res = await fetch(
        `/api/admin/brands/${brandId}/assets/${assetId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Delete failed: ${res.status}`);
      }
      toast.success("Asset deleted.");
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      deletingId = null;
    }
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Assets</Card.Title>
    <Card.Description>
      Reference images that admins can attach to generations for this brand.
    </Card.Description>
  </Card.Header>
  <Card.Content class="space-y-4">
    <div
      role="button"
      tabindex="0"
      class="border-input hover:border-foreground/40 flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed p-6 text-sm"
      ondrop={handleDrop}
      ondragover={handleDragOver}
      onclick={() => uploadInput?.click()}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") uploadInput?.click();
      }}
    >
      {uploading ? "Uploading…" : "Drop images here or click to choose files"}
    </div>
    <input
      bind:this={uploadInput}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      multiple
      class="hidden"
      onchange={handleFileInput}
    />

    {#if assets.length === 0}
      <p class="text-muted-foreground text-center text-sm">
        No assets uploaded yet.
      </p>
    {:else}
      <div class="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {#each assets as asset (asset.id)}
          <Card.Root>
            <Card.Header class="p-3">
              <Card.Title
                class="truncate text-sm"
                title={asset.displayName ?? asset.name}
              >
                {asset.displayName ?? asset.name}
              </Card.Title>
              <Card.Description class="text-xs">
                {formatBytes(asset.sizeBytes)}
              </Card.Description>
            </Card.Header>
            <Card.Content class="space-y-2 p-3 pt-0">
              <img
                src={`/api/brand-assets/${asset.id}`}
                alt={asset.displayName ?? asset.name}
                class="bg-muted h-32 w-full rounded object-contain"
                loading="lazy"
              />
              <div class="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1"
                  onclick={() => openEditDialog(asset)}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  class="flex-1"
                  disabled={deletingId !== null}
                  onclick={() => deleteAsset(asset.id)}
                >
                  {deletingId === asset.id ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </Card.Content>
          </Card.Root>
        {/each}
      </div>
    {/if}
  </Card.Content>
</Card.Root>

<Dialog.Root
  open={editingAsset !== null}
  onOpenChange={(open) => {
    if (!open) editingAsset = null;
  }}
>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Edit asset name</Dialog.Title>
      <Dialog.Description>
        Leave empty to fall back to the file name.
      </Dialog.Description>
    </Dialog.Header>
    <form class="space-y-4" onsubmit={saveAssetName}>
      <div class="space-y-2">
        <Label for="asset-name">Name</Label>
        <Input
          id="asset-name"
          bind:value={editName}
          maxlength={120}
          placeholder={editingAsset?.name}
        />
      </div>
      <Dialog.Footer>
        <Button type="submit" disabled={savingName}>
          {savingName ? "Saving…" : "Save"}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
