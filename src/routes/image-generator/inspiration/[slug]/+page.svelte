<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import ImageOffIcon from "@lucide/svelte/icons/image-off";
  import { toast } from "svelte-sonner";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const category = $derived(data.category);
  const items = $derived(data.items);

  type Item = PageData["items"][number];

  let copiedItemSlug = $state<string | null>(null);

  let lightboxOpen = $state(false);
  let lightboxItem = $state<Item | null>(null);

  function openLightbox(item: Item) {
    lightboxItem = item;
    lightboxOpen = true;
  }

  async function copyPrompt(itemSlug: string, prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      copiedItemSlug = itemSlug;
      toast.success("Prompt copied to clipboard.");
      setTimeout(() => {
        if (copiedItemSlug === itemSlug) {
          copiedItemSlug = null;
        }
      }, 2000);
    } catch {
      toast.error("Could not copy the prompt.");
    }
  }
</script>

<svelte:head>
  <title>{category.name} | Inspiration | Aggregator Offers Tool</title>
  <meta
    name="description"
    content={`Prompt inspiration in the ${category.name} collection.`}
  />
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
  <section class="space-y-3">
    <Badge
      variant="outline"
      class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
    >
      Inspiration
    </Badge>
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="space-y-2">
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          {category.name}
        </h1>
        <p class="text-muted-foreground max-w-3xl text-base leading-7">
          {items.length}
          {items.length === 1 ? "prompt" : "prompts"} in this collection. Copy a prompt
          and paste it into the composer.
        </p>
      </div>
      <Button href="/image-generator/inspiration" variant="outline">
        All categories
      </Button>
    </div>
  </section>

  {#if items.length === 0}
    <section
      class="border-border/70 bg-background/90 rounded-xl border p-10 text-center shadow-sm"
    >
      <p class="text-muted-foreground text-sm">
        This category has no prompts yet.
      </p>
    </section>
  {:else}
    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each items as item (item.itemSlug)}
        <Card.Root class="flex h-full flex-col overflow-hidden pt-0">
          {#if item.imageUrl}
            <button
              type="button"
              class="focus-visible:ring-ring block w-full cursor-zoom-in focus-visible:ring-2 focus-visible:outline-none"
              onclick={() => openLightbox(item)}
              aria-label={`View ${item.title} full screen`}
            >
              <img
                src={item.imageUrl}
                alt={item.title}
                class="bg-muted aspect-square w-full object-cover"
                loading="lazy"
              />
            </button>
          {:else}
            <div
              class="bg-muted text-muted-foreground flex aspect-square w-full items-center justify-center"
            >
              <ImageOffIcon class="size-8" />
            </div>
          {/if}

          <Card.Header>
            <Card.Title class="leading-snug">{item.title}</Card.Title>
          </Card.Header>

          <Card.Content class="flex-1">
            <p
              class="bg-muted/60 line-clamp-6 rounded-md p-3 text-sm leading-6 whitespace-pre-wrap"
            >
              {item.prompt}
            </p>
          </Card.Content>

          <Card.Footer>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="w-full"
              onclick={() => copyPrompt(item.itemSlug, item.prompt)}
            >
              {#if copiedItemSlug === item.itemSlug}
                <CheckIcon class="size-4" />
                Copied
              {:else}
                <CopyIcon class="size-4" />
                Copy prompt
              {/if}
            </Button>
          </Card.Footer>
        </Card.Root>
      {/each}
    </section>
  {/if}
</main>

<Dialog.Root bind:open={lightboxOpen}>
  <Dialog.Content
    class="h-[94vh] w-[96vw] max-w-[96vw] grid-rows-1 overflow-hidden p-2 sm:max-w-[96vw]"
  >
    {#if lightboxItem?.imageUrl}
      <Dialog.Header class="sr-only">
        <Dialog.Title>{lightboxItem.title}</Dialog.Title>
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
          src={lightboxItem.imageUrl}
          alt={lightboxItem.title}
          class="h-full w-full rounded-lg object-contain"
        />
      </button>
    {/if}
  </Dialog.Content>
</Dialog.Root>
