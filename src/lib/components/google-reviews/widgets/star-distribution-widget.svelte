<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import type { StarBucket } from "$lib/services/google-reviews/google-reviews";
  import StarIcon from "@lucide/svelte/icons/star";

  let {
    title = "Star rating distribution",
    data,
  }: {
    title?: string;
    settings?: Record<string, unknown>;
    data: StarBucket[];
  } = $props();

  const numberFormatter = new Intl.NumberFormat();

  const total = $derived(data.reduce((sum, bucket) => sum + bucket.count, 0));
  // 5 stars on top reads naturally for ratings.
  const buckets = $derived([...data].sort((a, b) => b.stars - a.stars));
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      How all captured reviews split across star ratings.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if total === 0}
      <p class="text-muted-foreground text-sm">No rated reviews yet.</p>
    {:else}
      <div class="space-y-3">
        {#each buckets as bucket (bucket.stars)}
          <div class="flex items-center gap-3">
            <span class="flex w-10 items-center gap-1 text-sm tabular-nums">
              {bucket.stars}
              <StarIcon class="size-3.5 fill-amber-400 text-amber-400" />
            </span>
            <div class="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
              <div
                class="h-full rounded-full bg-amber-400"
                style="width: {total > 0 ? (bucket.count / total) * 100 : 0}%"
              ></div>
            </div>
            <span
              class="text-muted-foreground w-20 text-right text-sm tabular-nums"
            >
              {numberFormatter.format(bucket.count)}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
