<script lang="ts">
  // shortcut: heatmap markup is copied from /sales/hours; extract a shared component if a third page needs it.
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import OfferSlotDialog from "$lib/components/sales/offer-slot-dialog.svelte";
  import {
    formatSalesAmount,
    formatSalesCount,
  } from "$lib/services/sales-dashboard";
  import {
    isDateView,
    isGroupedByDay,
    WEEKDAY_LABELS,
    type HeatCell,
  } from "$lib/services/sales-hours";
  import type {
    OfferDateRange,
    OfferSlot,
    buildOfferCalendar,
  } from "$lib/services/sales-offers";
  import { formatCompactMoney } from "$lib/services/forecasts/forecast-narrative";

  let {
    calendar,
    brand,
    range,
    channels,
    locations,
    allTime,
  }: {
    calendar: ReturnType<typeof buildOfferCalendar>;
    brand: string;
    /** Range the calendar covers (the scope default when the page is on all time). */
    range: OfferDateRange;
    channels?: string[];
    /** Only lines at these POS locations; omitted = all. */
    locations?: number[];
    /** The page has no range, so the calendar fell back to the default window. */
    allTime: boolean;
  } = $props();

  let metric = $state<"net" | "units">("net");
  let slot = $state<OfferSlot | null>(null);
  let slotTitle = $state("");
  let dialogOpen = $state(false);

  const byDay = $derived(isGroupedByDay(page.url.searchParams));
  const dateView = $derived(isDateView(page.url.searchParams));
  const grid = $derived(calendar.grid);
  const dates = $derived(calendar.dates);

  const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
  const money = (value: number) => formatSalesAmount(value);
  // `txns` holds offer units (see buildOfferCalendar).
  const cellValue = (cell: HeatCell) =>
    metric === "net"
      ? formatCompactMoney(cell.avgNet)
      : formatSalesCount(Math.round(cell.avgTxns));
  const dateLabel = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  const tone = (intensity: number) =>
    `background-color: color-mix(in oklch, var(--primary) ${Math.round(intensity * 100)}%, transparent)`;

  /** Same page with other view toggles; filters and tab stay. */
  function viewHref(grouped: boolean, dates: boolean): string {
    const search = new URLSearchParams(page.url.searchParams);
    search.delete("by");
    search.delete("view");
    if (grouped) search.set("by", "day");
    if (grouped && dates) search.set("view", "dates");
    return `${page.url.pathname}?${search}`;
  }

  function openSlot(next: OfferSlot, title: string) {
    slot = next;
    slotTitle = title;
    dialogOpen = true;
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>
      {dateView ? "Offers per date" : "Average offers per day"}, {range.from} to
      {range.to}
    </Card.Title>
    <Card.Action class="flex flex-wrap items-center gap-3">
      <ButtonGroup.Root aria-label="Show">
        <Button
          size="sm"
          variant={metric === "net" ? "default" : "outline"}
          aria-pressed={metric === "net"}
          onclick={() => (metric = "net")}
        >
          Net sales
        </Button>
        <Button
          size="sm"
          variant={metric === "units" ? "default" : "outline"}
          aria-pressed={metric === "units"}
          onclick={() => (metric = "units")}
        >
          Offers sold
        </Button>
      </ButtonGroup.Root>
      <div class="flex items-center gap-2">
        <Switch
          id="offers-group-by-day"
          checked={byDay}
          onCheckedChange={(checked) =>
            goto(viewHref(checked, false), { keepFocus: true, noScroll: true })}
        />
        <Label for="offers-group-by-day">Group by day</Label>
      </div>
      {#if byDay}
        <ButtonGroup.Root aria-label="Day grouping">
          <Button
            size="sm"
            href={viewHref(true, false)}
            variant={dateView ? "outline" : "default"}
            aria-current={dateView ? undefined : "page"}
          >
            Weekday average
          </Button>
          <Button
            size="sm"
            href={viewHref(true, true)}
            variant={dateView ? "default" : "outline"}
            aria-current={dateView ? "page" : undefined}
          >
            By date
          </Button>
        </ButtonGroup.Root>
      {/if}
    </Card.Action>
    <Card.Description>
      Offer units and offer net sales (excl. VAT) by POS business day and order
      hour{allTime ? ". No dates picked, so this shows the last 30 days" : ""}.
      Click a cell to see which offers sold.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    {#if grid.hours.length === 0}
      <p class="text-muted-foreground text-sm">No offers sold in this range.</p>
    {:else if dateView}
      <div class="space-y-6">
        {#each dates.months as month (month.key)}
          <section class="space-y-2" aria-label={month.label}>
            <h3 class="text-sm font-medium">{month.label}</h3>
            <div class="grid grid-cols-7 gap-0.5 text-xs">
              {#each WEEKDAY_LABELS as label (label)}
                <div class="text-muted-foreground py-1 text-center font-medium">
                  {label}
                </div>
              {/each}
              {#each { length: month.offset }, index (index)}
                <div></div>
              {/each}
              {#each month.cells as cell (cell.date)}
                <button
                  type="button"
                  disabled={!cell.inRange ||
                    (cell.net === 0 && cell.txns === 0)}
                  class={`enabled:hover:ring-ring relative flex min-h-14 items-center justify-center rounded text-sm tabular-nums enabled:cursor-pointer enabled:hover:ring-2 ${cell.inRange ? "" : "opacity-30"} ${cell.intensity > 0.55 ? "text-primary-foreground" : ""}`}
                  style={tone(cell.intensity)}
                  title={cell.inRange
                    ? `${dateLabel(cell.date)}: ${money(cell.net)} net, ${formatSalesCount(Math.round(cell.txns))} offers sold`
                    : `${dateLabel(cell.date)}: outside the date range`}
                  onclick={() =>
                    openSlot({ date: cell.date }, dateLabel(cell.date))}
                >
                  <span class="absolute top-1 left-1.5 text-[10px] opacity-70">
                    {cell.day}
                  </span>
                  {#if cell.net > 0}
                    {metric === "net"
                      ? formatCompactMoney(cell.net)
                      : formatSalesCount(Math.round(cell.txns))}
                  {/if}
                </button>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    {:else if byDay}
      <div class="overflow-x-auto">
        <table class="w-full border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              {#each WEEKDAY_LABELS as label (label)}
                <th
                  scope="col"
                  class="text-muted-foreground px-1 py-1 font-medium"
                >
                  {label}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            <tr>
              {#each grid.weekdays as cell, index (index)}
                <td class="h-14 min-w-16 p-0">
                  <button
                    type="button"
                    disabled={cell.avgNet === 0 && cell.avgTxns === 0}
                    class={`enabled:hover:ring-ring size-full rounded px-1 text-center text-sm tabular-nums enabled:cursor-pointer enabled:hover:ring-2 ${cell.intensity > 0.55 ? "text-primary-foreground" : ""}`}
                    style={tone(cell.intensity)}
                    title={`${WEEKDAY_LABELS[index]}: ${money(cell.avgNet)} net, ${cell.avgTxns.toFixed(1)} offers sold per day`}
                    onclick={() =>
                      openSlot(
                        { weekday: index + 1 },
                        `Every ${WEEKDAY_LABELS[index]}`,
                      )}
                  >
                    {cell.avgNet > 0 ? cellValue(cell) : ""}
                  </button>
                </td>
              {/each}
            </tr>
          </tbody>
        </table>
      </div>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th scope="col" class="sr-only">Weekday</th>
              {#each grid.hours as hour (hour)}
                <th
                  scope="col"
                  class="text-muted-foreground px-1 py-1 font-medium tabular-nums"
                >
                  {String(hour).padStart(2, "0")}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each grid.rows as row, index (index)}
              <tr>
                <th scope="row" class="pr-2 text-left font-medium">
                  {WEEKDAY_LABELS[index]}
                </th>
                {#each row as cell, column (grid.hours[column])}
                  {@const hour = grid.hours[column]}
                  <td class="h-10 min-w-11 p-0">
                    <button
                      type="button"
                      disabled={cell.avgNet === 0 && cell.avgTxns === 0}
                      class={`enabled:hover:ring-ring size-full rounded px-1 text-center tabular-nums enabled:cursor-pointer enabled:hover:ring-2 ${cell.intensity > 0.55 ? "text-primary-foreground" : ""}`}
                      style={tone(cell.intensity)}
                      title={`${WEEKDAY_LABELS[index]} ${hourLabel(hour)}: ${money(cell.avgNet)} net, ${cell.avgTxns.toFixed(1)} offers sold per day`}
                      onclick={() =>
                        openSlot(
                          { weekday: index + 1, hour },
                          `Every ${WEEKDAY_LABELS[index]} at ${hourLabel(hour)}`,
                        )}
                    >
                      {cell.avgNet > 0 ? cellValue(cell) : ""}
                    </button>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Card.Content>
</Card.Root>

<OfferSlotDialog
  bind:open={dialogOpen}
  {slot}
  title={slotTitle}
  {brand}
  {range}
  {channels}
  {locations}
/>
