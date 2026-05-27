<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let markdown = $state(data.guidelines);
  let savingGuidelines = $state(false);
  let uploadInput = $state<HTMLInputElement | undefined>();
  let uploading = $state(false);
  let deletingId = $state<string | null>(null);

  $effect(() => {
    markdown = data.guidelines;
  });

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  async function saveGuidelines() {
    if (savingGuidelines) return;
    savingGuidelines = true;
    try {
      const res = await fetch(`/api/admin/brands/${data.brand.id}/guidelines`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Save failed: ${res.status}`);
      }
      toast.success("Guidelines saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      savingGuidelines = false;
    }
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
      const res = await fetch(`/api/admin/brands/${data.brand.id}/assets`, {
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

  async function deleteAsset(assetId: string) {
    if (deletingId) return;
    if (!confirm("Delete this brand asset? This cannot be undone.")) return;
    deletingId = assetId;
    try {
      const res = await fetch(
        `/api/admin/brands/${data.brand.id}/assets/${assetId}`,
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

<svelte:head>
  <title>{data.brand.name} brand | Admin</title>
</svelte:head>

<main class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
  <section class="space-y-2">
    <a
      class="text-muted-foreground text-sm hover:underline"
      href="/admin/brands"
    >
      ← All brands
    </a>
    <h1 class="text-3xl font-semibold tracking-tight">{data.brand.name}</h1>
    <p class="text-muted-foreground text-sm">
      Slug:
      {#if data.brand.slug}
        <code class="text-xs">{data.brand.slug}</code>
      {:else}
        <span class="text-destructive">empty — uploads disabled until set</span>
      {/if}
    </p>
  </section>

  <Card.Root>
    <Card.Header>
      <Card.Title>Guidelines</Card.Title>
      <Card.Description>
        Injected at the start of the final prompt for any generation that
        selects this brand. Markdown is sent verbatim. Not used by Enhance.
      </Card.Description>
    </Card.Header>
    <Card.Content class="space-y-3">
      <Textarea
        rows={10}
        bind:value={markdown}
        placeholder="e.g. Use vibrant, appetising colours; show food at 45° angle."
      />
      <div class="flex justify-end">
        <Button
          onclick={saveGuidelines}
          disabled={savingGuidelines || !data.brand.slug}
        >
          {savingGuidelines ? "Saving…" : "Save guidelines"}
        </Button>
      </div>
    </Card.Content>
  </Card.Root>

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

      {#if data.assets.length === 0}
        <p class="text-muted-foreground text-center text-sm">
          No assets uploaded yet.
        </p>
      {:else}
        <div class="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {#each data.assets as asset (asset.id)}
            <Card.Root>
              <Card.Header class="p-3">
                <Card.Title class="truncate text-sm" title={asset.name}>
                  {asset.name}
                </Card.Title>
                <Card.Description class="text-xs">
                  {formatBytes(asset.sizeBytes)}
                </Card.Description>
              </Card.Header>
              <Card.Content class="space-y-2 p-3 pt-0">
                <img
                  src={`/api/brand-assets/${asset.id}`}
                  alt={asset.name}
                  class="bg-muted h-32 w-full rounded object-contain"
                  loading="lazy"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  class="w-full"
                  disabled={deletingId !== null}
                  onclick={() => deleteAsset(asset.id)}
                >
                  {deletingId === asset.id ? "Deleting…" : "Delete"}
                </Button>
              </Card.Content>
            </Card.Root>
          {/each}
        </div>
      {/if}
    </Card.Content>
  </Card.Root>
</main>
