<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    formatInteger,
    type GoogleAnalyticsHeatmapCell,
  } from "$lib/services/google-analytics/google-analytics";

  let {
    cells,
    title = "When people visit",
    description = "Sessions by hour of day and day of week over the selected period (property time zone).",
  }: {
    /** 7 × 24 cells, GA4 dayOfWeek 0 = Sunday. */
    cells: GoogleAnalyticsHeatmapCell[];
    title?: string;
    description?: string;
  } = $props();

  // Monday-first rows; GA4 numbers Sunday as 0.
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const DAY_LABELS: Record<number, string> = {
    0: "Sun",
    1: "Mon",
    2: "Tue",
    3: "Wed",
    4: "Thu",
    5: "Fri",
    6: "Sat",
  };
  const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

  const max = $derived(
    cells.reduce((acc, cell) => Math.max(acc, cell.sessions), 0),
  );
  const total = $derived(cells.reduce((acc, cell) => acc + cell.sessions, 0));

  const byKey = $derived(
    new Map(cells.map((cell) => [`${cell.dayOfWeek}:${cell.hour}`, cell])),
  );

  function sessionsAt(day: number, hour: number): number {
    return byKey.get(`${day}:${hour}`)?.sessions ?? 0;
  }

  // Sequential, single hue: lighter = fewer, darker = more. Zero stays on the
  // muted surface so empty hours read as empty, not as "a little".
  function fill(sessions: number): string {
    if (sessions <= 0 || max <= 0) {
      return "color-mix(in oklab, var(--chart-1) 0%, var(--muted))";
    }
    const ratio = sessions / max;
    const pct = Math.round(12 + 78 * Math.sqrt(ratio));
    return `color-mix(in oklab, var(--chart-1) ${pct}%, var(--muted))`;
  }

  const legendSteps = [0, 0.1, 0.35, 0.65, 1];

  function hourLabel(hour: number): string {
    return `${hour.toString().padStart(2, "0")}:00`;
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>{description}</Card.Description>
  </Card.Header>
  <Card.Content>
    {#if total === 0}
      <p class="text-muted-foreground text-sm">No sessions in this period.</p>
    {:else}
      <div class="overflow-x-auto">
        <div
          class="grid min-w-[40rem] gap-[2px]"
          style="grid-template-columns: 2.5rem repeat(24, minmax(0, 1fr));"
          role="table"
          aria-label="{title}: sessions by weekday and hour"
        >
          <div role="row" class="contents">
            <!-- Corner cell must stay in grid flow (sr-only would be absolutely
                 positioned and shift every row by one column). -->
            <div role="columnheader" aria-label="Day"></div>
            {#each HOURS as hour (hour)}
              <div
                role="columnheader"
                class="text-muted-foreground pb-1 text-center text-[0.65rem] tabular-nums"
              >
                {hour % 3 === 0 ? hour.toString().padStart(2, "0") : ""}
              </div>
            {/each}
          </div>
          {#each DAY_ORDER as day (day)}
            <div role="row" class="contents">
              <div
                role="rowheader"
                class="text-muted-foreground flex items-center pr-2 text-xs"
              >
                {DAY_LABELS[day]}
              </div>
              {#each HOURS as hour (hour)}
                {@const sessions = sessionsAt(day, hour)}
                <div
                  role="cell"
                  class="hover:ring-foreground/40 aspect-square rounded-[3px] hover:ring-2"
                  style="background: {fill(sessions)};"
                  title="{DAY_LABELS[day]} {hourLabel(hour)} — {formatInteger(
                    sessions,
                  )} sessions"
                  aria-label="{DAY_LABELS[day]} {hourLabel(
                    hour,
                  )}: {formatInteger(sessions)} sessions"
                ></div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
      <div
        class="text-muted-foreground mt-3 flex items-center justify-end gap-2 text-xs"
      >
        <span>Fewer</span>
        {#each legendSteps as step (step)}
          <span
            class="inline-block size-3 rounded-[2px]"
            style="background: {fill(step * max)};"
            aria-hidden="true"
          ></span>
        {/each}
        <span>More</span>
        <span class="ml-3">Peak {formatInteger(max)} sessions in an hour</span>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
