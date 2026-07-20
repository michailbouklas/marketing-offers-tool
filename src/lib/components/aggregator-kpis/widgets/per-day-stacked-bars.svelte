<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { formatSalesLoss } from "$lib/services/aggregator-kpis/aggregator-kpis";

  type Segment = { key: string; label: string; color: string };
  type DayDatum = {
    /** "YYYY-MM-DD" UTC day. */
    date: string;
    values: Record<string, number | null>;
    loss: number | null;
  };

  let {
    title,
    description,
    segments,
    days,
    formatValue,
  }: {
    title: string;
    description: string;
    /** Stacked segments, bottom-to-top, each with its own colour. */
    segments: Segment[];
    days: DayDatum[];
    /** Formats a segment value for the tooltip, e.g. duration or count. */
    formatValue: (value: number) => string;
  } = $props();

  const dayTotal = (day: DayDatum) =>
    segments.reduce((sum, s) => sum + (day.values[s.key] ?? 0), 0);

  const maxTotal = $derived(Math.max(0, ...days.map((day) => dayTotal(day))));

  const totalLoss = $derived(
    days.reduce((sum, day) => sum + (day.loss ?? 0), 0),
  );

  const hasLoss = $derived(days.some((day) => day.loss !== null));

  function formatDay(date: string): string {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      return date;
    }
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(parsed);
  }

  function tooltip(day: DayDatum): string {
    const parts = segments.map(
      (s) => `${s.label}: ${formatValue(day.values[s.key] ?? 0)}`,
    );
    if (day.loss !== null) {
      parts.push(`Lost: ${formatSalesLoss(day.loss)}`);
    }
    return `${formatDay(day.date)} — ${parts.join(", ")}`;
  }
</script>

<Card.Root>
  <Card.Header>
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="space-y-1">
        <Card.Title>{title}</Card.Title>
        <Card.Description>{description}</Card.Description>
      </div>
      <Badge variant="outline" class="text-muted-foreground text-[0.65rem]">
        approx.
      </Badge>
    </div>
  </Card.Header>
  <Card.Content>
    {#if days.length === 0 || maxTotal <= 0}
      <p class="text-muted-foreground text-sm">
        No per-day data for the latest completed period yet.
      </p>
    {:else}
      <!-- Legend -->
      <div class="mb-4 flex flex-wrap items-center gap-4">
        {#each segments as segment (segment.key)}
          <div class="flex items-center gap-2">
            <span
              class="size-3 rounded-[3px]"
              style="background-color: {segment.color}"
            ></span>
            <span class="text-muted-foreground text-xs">{segment.label}</span>
          </div>
        {/each}
      </div>

      <!-- Bars -->
      <div class="flex items-end gap-2" style="height: 10rem">
        {#each days as day (day.date)}
          {@const total = dayTotal(day)}
          <div
            class="flex h-full flex-1 flex-col justify-end"
            title={tooltip(day)}
          >
            <div
              class="bg-muted/40 flex w-full flex-col-reverse overflow-hidden rounded-sm"
              style="height: {(total / maxTotal) * 100}%"
            >
              {#each segments as segment, i (segment.key)}
                {@const value = day.values[segment.key] ?? 0}
                {#if value > 0}
                  <div
                    class={i === segments.length - 1 ? "rounded-t-sm" : ""}
                    style="height: {(value / total) *
                      100}%; background-color: {segment.color}"
                  ></div>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <!-- X axis -->
      <div class="mt-2 flex gap-2">
        {#each days as day (day.date)}
          <div class="text-muted-foreground flex-1 text-center text-[0.65rem]">
            {formatDay(day.date)}
          </div>
        {/each}
      </div>

      {#if hasLoss}
        <p class="text-muted-foreground mt-4 text-sm">
          Money lost this period:
          <span class="text-foreground font-medium tabular-nums">
            {formatSalesLoss(totalLoss)}
          </span>
        </p>
      {/if}
    {/if}
  </Card.Content>
</Card.Root>
