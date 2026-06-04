<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    Card,
    CardContent,
    CardFooter,
  } from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import {
    Popover,
    PopoverContent,
    PopoverTrigger,
  } from "$lib/components/ui/popover/index.js";
  import type { GeneratedImageDTO } from "$lib/services/image-generator/image-generator";

  interface Props {
    items: GeneratedImageDTO[];
    elapsedById?: Record<string, number>;
    onReprompt?: (item: GeneratedImageDTO) => void;
    onEditWithReference?: (item: GeneratedImageDTO) => void;
  }

  let {
    items,
    elapsedById = {},
    onReprompt,
    onEditWithReference,
  }: Props = $props();

  let lightboxOpen = $state(false);
  let lightboxItem = $state<GeneratedImageDTO | null>(null);

  function openLightbox(item: GeneratedImageDTO) {
    lightboxItem = item;
    lightboxOpen = true;
  }

  function downloadFilename(item: GeneratedImageDTO): string {
    const slug = item.prompt
      .slice(0, 40)
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    return `${slug || "image"}-${item.id}.png`;
  }

  function statusBadgeVariant(
    status: GeneratedImageDTO["status"],
  ): "default" | "outline" | "destructive" | "secondary" {
    if (status === "completed") return "default";
    if (status === "failed") return "destructive";
    return "secondary";
  }

  function formatElapsed(ms: number | null | undefined): string {
    if (ms === null || ms === undefined) return "—";
    return `${(ms / 1000).toFixed(1)}s`;
  }
</script>

{#if items.length === 0}
  <div
    class="text-muted-foreground rounded-md border border-dashed p-10 text-center text-sm"
  >
    No images yet. Submit a prompt above to generate one.
  </div>
{:else}
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each items as item (item.id)}
      <Card>
        <CardContent>
          {#if item.status === "completed"}
            <button
              type="button"
              class="focus-visible:ring-ring block w-full cursor-zoom-in rounded-md focus-visible:ring-2 focus-visible:outline-none"
              onclick={() => openLightbox(item)}
              aria-label="View image full screen"
            >
              <img
                src={`/api/images/${item.id}/file`}
                alt={item.prompt}
                class="aspect-square w-full rounded-md object-cover"
                loading="lazy"
              />
            </button>
          {:else if item.status === "failed"}
            <div
              class="bg-destructive/10 text-destructive flex aspect-square w-full items-center justify-center rounded-md p-3 text-center text-xs"
            >
              {item.errorMessage ?? "Generation failed"}
            </div>
          {:else}
            <div
              class="bg-muted text-muted-foreground flex aspect-square w-full animate-pulse flex-col items-center justify-center gap-1 rounded-md text-xs"
              data-testid="image-skeleton"
              data-row-id={item.id}
            >
              <span>{item.model ?? "(default model)"}</span>
              <span class="font-mono">
                {formatElapsed(elapsedById[item.id] ?? 0)}
              </span>
            </div>
          {/if}

          <div class="mt-3 space-y-2">
            <p class="text-foreground line-clamp-2 text-sm">{item.prompt}</p>
            <div class="flex flex-wrap items-center gap-2">
              {#if item.model}
                <Badge variant="outline">{item.model}</Badge>
              {/if}
              <Badge variant={statusBadgeVariant(item.status)}>
                {item.status}
              </Badge>
              {#if item.status === "completed" && item.durationMs !== null}
                <span class="text-muted-foreground text-xs">
                  {formatElapsed(item.durationMs)}
                </span>
              {/if}
            </div>
          </div>
        </CardContent>
        <CardFooter class="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            href={`/api/images/${item.id}/file`}
            download={downloadFilename(item)}
            disabled={item.status !== "completed"}
          >
            Download
          </Button>

          <Popover>
            <PopoverTrigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="sm">Edit</Button>
              {/snippet}
            </PopoverTrigger>
            <PopoverContent class="w-56 p-1">
              <button
                type="button"
                class="hover:bg-accent block w-full rounded px-2 py-1.5 text-left text-sm"
                onclick={() => onReprompt?.(item)}
              >
                Re-prompt
              </button>
              <button
                type="button"
                class="hover:bg-accent block w-full rounded px-2 py-1.5 text-left text-sm disabled:opacity-50"
                disabled={item.status !== "completed"}
                onclick={() => onEditWithReference?.(item)}
              >
                Edit with reference image
              </button>
            </PopoverContent>
          </Popover>
        </CardFooter>
      </Card>
    {/each}
  </div>
{/if}

<Dialog.Root bind:open={lightboxOpen}>
  <Dialog.Content
    class="h-[94vh] w-[96vw] max-w-[96vw] grid-rows-1 overflow-hidden p-2 sm:max-w-[96vw]"
  >
    {#if lightboxItem}
      <Dialog.Header class="sr-only">
        <Dialog.Title>{lightboxItem.prompt}</Dialog.Title>
        <Dialog.Description>
          Full-screen image preview. Press Escape or use the close button to
          dismiss.
        </Dialog.Description>
      </Dialog.Header>
      <button
        type="button"
        class="min-h-0 cursor-zoom-out outline-none"
        onclick={() => (lightboxOpen = false)}
        aria-label="Close full-screen preview"
      >
        <img
          src={`/api/images/${lightboxItem.id}/file`}
          alt={lightboxItem.prompt}
          class="h-full w-full rounded-lg object-contain"
        />
      </button>
    {/if}
  </Dialog.Content>
</Dialog.Root>
