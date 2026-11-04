<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    formatSalesAmount,
    formatSalesCount,
  } from "$lib/services/sales-dashboard";
  import {
    OFFER_VERDICT_LABELS,
    compareWinner,
    offerCompareMetrics,
    weekdayMix,
    weeklyCurve,
    type CompareMetric,
    type OfferDailyRow,
    type OfferValue,
    type OfferVerdict,
  } from "$lib/services/sales-offers";
  import { reasonColor } from "$lib/services/aggregator-kpis/reason-palette";
  import { cn } from "$lib/utils.js";
  import { scaleLinear } from "d3-scale";
  import { LineChart, Spline } from "layerchart";

  let {
    open = $bindable(false),
    offers,
    brand,
    verdictVariant,
  }: {
    open: boolean;
    /** Exactly two offers; the page only opens the dialog then. */
    offers: [OfferValue, OfferValue] | null;
    brand: string;
    verdictVariant: Record<
      OfferVerdict,
      "default" | "secondary" | "destructive" | "outline"
    >;
  } = $props();

  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  let daily = $state<OfferDailyRow[] | null>(null);
  let failed = $state(false);

  // Refetch whenever the dialog opens on a pair; drop answers for a stale pair.
  $effect(() => {
    if (!open || !offers) return;
    const codes = offers.map((offer) => offer.code);
    let stale = false;
    daily = null;
    failed = false;
    fetch("/sales/offers/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand, codes }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        const rows: OfferDailyRow[] = await response.json();
        if (!stale) daily = rows;
      })
      .catch(() => {
        if (!stale) failed = true;
      });
    return () => {
      stale = true;
    };
  });

  const metrics = $derived(
    offers ? offerCompareMetrics(offers[0], offers[1]) : [],
  );

  const curve = $derived.by(() => {
    if (!offers || !daily) return [];
    const [a, b] = offers.map((offer) => weeklyCurve(daily!, offer.code));
    return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => ({
      week: i + 1,
      a: a[i] ?? null,
      b: b[i] ?? null,
    }));
  });

  const mix = $derived(
    offers && daily
      ? offers.map((offer) => weekdayMix(daily!, offer.code))
      : null,
  );

  // The theme's --chart-N tokens are near-identical grays; blue vs orange reads apart.
  const COLORS = [reasonColor(5), reasonColor(1)];

  const chartConfig = $derived({
    a: { label: offers?.[0].name ?? "A", color: COLORS[0] },
    b: { label: offers?.[1].name ?? "B", color: COLORS[1] },
  } satisfies Chart.ChartConfig);

  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  function show(kind: CompareMetric["kind"], value: number | null): string {
    if (value === null) return "–";
    if (kind === "money") return formatSalesAmount(value);
    if (kind === "count") return formatSalesCount(Math.round(value));
    if (kind === "percent") return pct(value);
    return value.toFixed(1);
  }

  /** B relative to A: percentage points for percentages, % change otherwise. */
  function delta(metric: CompareMetric): string {
    const { a, b, kind } = metric;
    if (a === null || b === null) return "–";
    if (kind === "percent") {
      const pp = (b - a) * 100;
      return `${pp >= 0 ? "+" : ""}${pp.toFixed(1)} pp`;
    }
    if (a === 0) return "–";
    const change = (b - a) / Math.abs(a);
    return `${change >= 0 ? "+" : ""}${pct(change)}`;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] w-[90vw] overflow-y-auto sm:max-w-[90vw]">
    {#if offers}
      <Dialog.Header>
        <Dialog.Title>Offer VS</Dialog.Title>
        <Dialog.Description>
          How the two offers performed while they were on sale. Rates are per
          active day or per order, so a longer run does not win by default.
        </Dialog.Description>
      </Dialog.Header>

      <div class="grid gap-4 md:grid-cols-2">
        {#each offers as offer, index (offer.code)}
          <Card.Root>
            <Card.Content class="space-y-1 py-4">
              <div class="flex items-center gap-2">
                <span
                  class="size-3 shrink-0 rounded-sm"
                  style="background: {COLORS[index]}"
                ></span>
                <span class="font-medium">{offer.name}</span>
                <Badge variant={verdictVariant[offer.verdict]}>
                  {OFFER_VERDICT_LABELS[offer.verdict]}
                </Badge>
              </div>
              <p class="text-muted-foreground text-xs">
                {offer.code}{offer.channel ? ` · ${offer.channel}` : ""} · {offer.firstSale}
                → {offer.lastSale} ({formatSalesCount(offer.daysOnSale)} active days)
              </p>
            </Card.Content>
          </Card.Root>
        {/each}
      </div>

      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Metric</Table.Head>
            <Table.Head class="text-right">{offers[0].name}</Table.Head>
            <Table.Head class="text-right">{offers[1].name}</Table.Head>
            <Table.Head class="text-right">Difference (2nd vs 1st)</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each metrics as metric (metric.label)}
            {@const winner = compareWinner(metric)}
            <Table.Row>
              <Table.Cell
                class={metric.better === null ? "text-muted-foreground" : ""}
              >
                {metric.label}
              </Table.Cell>
              {#each ["a", "b"] as const as side (side)}
                <Table.Cell
                  class={cn(
                    "text-right tabular-nums",
                    winner === side && "bg-primary/10 font-semibold",
                  )}
                >
                  {show(metric.kind, metric[side])}
                </Table.Cell>
              {/each}
              <Table.Cell class="text-muted-foreground text-right tabular-nums">
                {delta(metric)}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>

      {#if failed}
        <p class="text-destructive text-sm">
          Could not load the daily sales of these offers. Close and try again.
        </p>
      {:else if !daily || !mix}
        <div class="grid gap-4 lg:grid-cols-[2fr_1fr]" aria-busy="true">
          <Skeleton class="h-72 w-full" />
          <Skeleton class="h-72 w-full" />
        </div>
      {:else}
        <div class="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <section class="space-y-2">
            <h3 class="text-sm font-medium">Units per week since launch</h3>
            <p class="text-muted-foreground text-xs">
              Week 1 is each offer's first week on sale, so both start together.
              Shows how fast each one took off and how long it held.
            </p>
            {#if curve.length < 2}
              <p class="text-muted-foreground text-sm">
                Both offers sold for less than two weeks; no curve to draw.
              </p>
            {:else}
              <Chart.Container config={chartConfig} class="h-72 w-full">
                <LineChart
                  data={curve}
                  x="week"
                  xScale={scaleLinear()}
                  yPadding={[0, 16]}
                  axis
                  grid
                  legend
                  series={[
                    {
                      key: "a",
                      label: offers[0].name,
                      color: "var(--color-a)",
                    },
                    {
                      key: "b",
                      label: offers[1].name,
                      color: "var(--color-b)",
                    },
                  ]}
                  props={{
                    xAxis: { format: (v: number) => `W${v}` },
                    yAxis: { format: (v: number) => formatSalesCount(v) },
                  }}
                >
                  {#snippet marks({ context })}
                    {#each context.series.visibleSeries as s (s.key)}
                      <Spline
                        seriesKey={s.key}
                        class="stroke-2"
                        stroke={s.color}
                        defined={(d: Record<string, number | null>) =>
                          d[s.key] !== null}
                      />
                    {/each}
                  {/snippet}
                  {#snippet tooltip()}
                    <Chart.Tooltip
                      indicator="dot"
                      labelFormatter={(v: number) => `Week ${v}`}
                    />
                  {/snippet}
                </LineChart>
              </Chart.Container>
            {/if}
          </section>

          <section class="space-y-2">
            <h3 class="text-sm font-medium">Weekday mix (share of units)</h3>
            <p class="text-muted-foreground text-xs">
              Which days carried each offer; useful for picking launch days.
            </p>
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Day</Table.Head>
                  {#each offers as offer, index (offer.code)}
                    <Table.Head class="text-right">
                      <span
                        class="inline-flex max-w-40 items-center gap-1.5"
                        title={offer.name}
                      >
                        <span
                          class="size-2.5 shrink-0 rounded-sm"
                          style="background: {COLORS[index]}"
                        ></span>
                        <span class="truncate">{offer.name}</span>
                      </span>
                    </Table.Head>
                  {/each}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each WEEKDAYS as day, i (day)}
                  <Table.Row>
                    <Table.Cell>{day}</Table.Cell>
                    {#each mix as shares, index (index)}
                      <Table.Cell class="text-right tabular-nums">
                        {pct(shares[i])}
                      </Table.Cell>
                    {/each}
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </section>
        </div>
      {/if}

      <p class="text-muted-foreground text-xs leading-5">
        The offers may have run in different seasons or at different prices;
        compare the dates above before reading too much into the gap. Food cost
        uses today's catalogue, and full-price sales the offers replaced and
        aggregator commission are not counted.
      </p>
    {/if}
  </Dialog.Content>
</Dialog.Root>
