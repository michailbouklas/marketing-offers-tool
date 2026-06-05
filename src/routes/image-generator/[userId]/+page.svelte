<script lang="ts">
  import GenerationsHistory from "$lib/components/image-generator/generations-history.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const targetUser = $derived(data.targetUser);
</script>

<svelte:head>
  <title>{targetUser.name}'s Image Generations | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Review a user's generated images, prompts, models, and generation metadata."
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
          {targetUser.name}'s generations
        </h1>
        <p class="text-muted-foreground max-w-3xl text-base leading-7">
          Browse every image {targetUser.name} ({targetUser.email}) generated,
          ordered from newest to oldest.
        </p>
      </div>
      <Button href="/admin/image-generator-usage" variant="outline">
        <ArrowLeftIcon class="size-4" />
        Back to usage
      </Button>
    </div>
  </section>

  <GenerationsHistory
    imagePage={data.imagePage}
    promptGroups={data.promptGroups}
    filterOptions={data.filterOptions}
    filters={data.filters}
    brands={data.brands}
    basePath={`/image-generator/${targetUser.id}`}
    usageEndpoint={`/api/images/usage?userId=${encodeURIComponent(targetUser.id)}`}
    chartDescription="Images this user generated, by day."
    emptyMessage="This user has not generated any images yet."
  />
</main>
