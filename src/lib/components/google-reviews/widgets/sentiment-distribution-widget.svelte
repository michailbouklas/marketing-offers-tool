<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    formatSentimentLabel,
    type SentimentBucket,
  } from "$lib/services/google-reviews/google-reviews";

  let {
    title = "Sentiment distribution",
    data,
  }: {
    title?: string;
    settings?: Record<string, unknown>;
    data: SentimentBucket[];
  } = $props();

  const numberFormatter = new Intl.NumberFormat();

  const barClasses: Record<string, string> = {
    positive: "bg-emerald-500",
    neutral: "bg-zinc-400",
    negative: "bg-red-500",
  };

  const total = $derived(data.reduce((sum, bucket) => sum + bucket.count, 0));
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>
      How the analyzed reviews split across sentiment classes.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if total === 0}
      <p class="text-muted-foreground text-sm">No analyzed reviews yet.</p>
    {:else}
      <div class="space-y-3">
        {#each data as bucket (bucket.sentiment)}
          <div class="flex items-center gap-3">
            <span class="w-20 text-sm">
              {formatSentimentLabel(bucket.sentiment)}
            </span>
            <div class="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
              <div
                class="h-full rounded-full {barClasses[bucket.sentiment]}"
                style="width: {total > 0 ? (bucket.count / total) * 100 : 0}%"
              ></div>
            </div>
            <span
              class="text-muted-foreground w-28 text-right text-sm tabular-nums"
            >
              {numberFormatter.format(bucket.count)}
              ({total > 0 ? ((bucket.count / total) * 100).toFixed(1) : "0"}%)
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
