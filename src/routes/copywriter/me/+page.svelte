<script lang="ts">
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button/index.js";
  import CopyResultCard from "../CopyResultCard.svelte";
  import type { GeneratedCopyDTO } from "$lib/services/copywriter/copywriter";
  import { rateVariant } from "$lib/services/copywriter/copywriter-client";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let items = $state<GeneratedCopyDTO[]>(data.history.items);
  $effect(() => {
    items = data.history.items;
  });

  const totalPages = $derived(
    Math.max(Math.ceil(data.history.total / data.history.pageSize), 1),
  );

  async function handleFeedback(
    item: GeneratedCopyDTO,
    variantIndex: number,
    feedback: { rating?: number | null; picked?: boolean },
  ) {
    try {
      const { item: updated } = await rateVariant(
        item.id,
        variantIndex,
        feedback,
      );
      items = items.map((existing) =>
        existing.id === updated.id ? updated : existing,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }
</script>

<svelte:head>
  <title>My Copy</title>
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">My copy</h1>
      <p class="text-muted-foreground text-sm">
        Everything you've generated in the copywriter, newest first.
      </p>
    </div>
    <Button href="/copywriter" variant="outline" size="sm">
      Back to copywriter
    </Button>
  </div>

  {#if items.length === 0}
    <p class="text-muted-foreground rounded-xl border p-6 text-center text-sm">
      Nothing here yet — generate your first copy from the copywriter.
    </p>
  {:else}
    <section class="grid gap-4">
      {#each items as item (item.id)}
        <CopyResultCard
          {item}
          onFeedback={(variantIndex, feedback) =>
            handleFeedback(item, variantIndex, feedback)}
        />
      {/each}
    </section>

    {#if totalPages > 1}
      <nav class="flex items-center justify-center gap-2">
        <Button
          href={`/copywriter/me?page=${data.history.page - 1}`}
          variant="outline"
          size="sm"
          disabled={data.history.page <= 1}
        >
          Previous
        </Button>
        <p class="text-muted-foreground text-sm">
          Page {data.history.page} of {totalPages}
        </p>
        <Button
          href={`/copywriter/me?page=${data.history.page + 1}`}
          variant="outline"
          size="sm"
          disabled={data.history.page >= totalPages}
        >
          Next
        </Button>
      </nav>
    {/if}
  {/if}
</main>
