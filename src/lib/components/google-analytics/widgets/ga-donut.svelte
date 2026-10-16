<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    formatInteger,
    formatPercent,
    type GoogleAnalyticsAudienceSegment,
  } from "$lib/services/google-analytics/google-analytics";

  let {
    segments,
    title = "New vs returning",
    description = "Share of active users seeing the site for the first time versus coming back.",
  }: {
    segments: GoogleAnalyticsAudienceSegment[];
    title?: string;
    description?: string;
  } = $props();

  // Fixed hue per entity, never by rank (dataviz rule).
  const COLORS: Record<string, string> = {
    new: "var(--chart-1)",
    returning: "var(--chart-2)",
  };
  const FALLBACK_COLOR = "var(--muted-foreground)";
  const LABELS: Record<string, string> = {
    new: "New users",
    returning: "Returning users",
  };

  const total = $derived(
    segments.reduce((acc, segment) => acc + segment.activeUsers, 0),
  );

  const slices = $derived.by(() => {
    let cursor = 0;
    return segments.map((segment) => {
      const share = total > 0 ? segment.activeUsers / total : 0;
      const start = cursor;
      cursor += share;
      return {
        ...segment,
        share,
        start,
        end: cursor,
        color: COLORS[segment.label] ?? FALLBACK_COLOR,
        name: LABELS[segment.label] ?? segment.label,
      };
    });
  });

  // A conic gradient draws the ring; a 2px surface gap separates segments.
  const gradient = $derived(
    slices.length === 0
      ? "var(--muted)"
      : `conic-gradient(${slices
          .map(
            (slice) =>
              `${slice.color} ${(slice.start * 100).toFixed(2)}% ${(slice.end * 100).toFixed(2)}%`,
          )
          .join(", ")})`,
  );
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>{description}</Card.Description>
  </Card.Header>
  <Card.Content>
    {#if total === 0}
      <p class="text-muted-foreground text-sm">No users in this period.</p>
    {:else}
      <div class="flex flex-wrap items-center gap-6">
        <div
          class="relative size-36 shrink-0 rounded-full"
          style="background: {gradient};"
          role="img"
          aria-label={slices
            .map((slice) => `${slice.name} ${formatPercent(slice.share)}`)
            .join(", ")}
        >
          <div
            class="bg-card absolute inset-[18%] flex flex-col items-center justify-center rounded-full text-center"
          >
            <span class="text-2xl font-semibold tabular-nums"
              >{formatInteger(total)}</span
            >
            <span class="text-muted-foreground text-[0.65rem] uppercase"
              >users</span
            >
          </div>
        </div>
        <ul class="min-w-[14rem] flex-1 space-y-2 text-sm">
          {#each slices as slice, position (position)}
            <li class="flex items-center justify-between gap-3">
              <span class="flex items-center gap-2">
                <span
                  class="inline-block size-3 rounded-[2px]"
                  style="background: {slice.color};"
                  aria-hidden="true"
                ></span>
                {slice.name}
              </span>
              <span class="text-right tabular-nums">
                <span class="font-medium">{formatPercent(slice.share)}</span>
                <span class="text-muted-foreground">
                  · {formatInteger(slice.activeUsers)} users ·
                  {formatPercent(slice.engagementRate)} engaged
                </span>
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
