<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const categories = $derived(data.categories);
</script>

<svelte:head>
  <title>Inspiration | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Browse curated prompt inspiration for the image generator."
  />
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
  <section class="space-y-3">
    <Badge
      variant="outline"
      class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
    >
      Image generator
    </Badge>
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="space-y-2">
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Inspiration
        </h1>
        <p class="text-muted-foreground max-w-3xl text-base leading-7">
          Curated prompt collections to kick-start your next generation. Pick a
          category to browse its prompts.
        </p>
      </div>
      <Button href="/image-generator" variant="outline">
        Open the composer
      </Button>
    </div>
  </section>

  {#if categories.length === 0}
    <section
      class="border-border/70 bg-background/90 rounded-xl border p-10 text-center shadow-sm"
    >
      <p class="text-muted-foreground text-sm">
        No inspiration categories yet. Check back soon.
      </p>
    </section>
  {:else}
    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each categories as category (category.slug)}
        <a
          href={`/image-generator/inspiration/${category.slug}`}
          class="group focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:outline-none"
        >
          <Card.Root
            class="group-hover:border-primary/40 h-full transition-colors"
          >
            <Card.Header>
              <div class="flex items-start justify-between gap-3">
                <div
                  class="bg-muted text-muted-foreground group-hover:text-foreground flex size-10 items-center justify-center rounded-lg transition-colors"
                >
                  <FolderOpenIcon class="size-5" />
                </div>
                <Badge variant="secondary">
                  {category.itemCount}
                  {category.itemCount === 1 ? "prompt" : "prompts"}
                </Badge>
              </div>
              <Card.Title class="mt-2">{category.name}</Card.Title>
              <Card.Description>
                Browse the prompts in this collection.
              </Card.Description>
            </Card.Header>
          </Card.Root>
        </a>
      {/each}
    </section>
  {/if}
</main>
