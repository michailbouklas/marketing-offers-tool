<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { reasonColor } from "$lib/services/aggregator-kpis/reason-palette";
  import { scaleUtc } from "d3-scale";
  import { LineChart, Spline } from "layerchart";
  import { Button } from "$lib/components/ui/button/index.js";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { toast } from "svelte-sonner";
  import {
    formatSalesAmount,
    formatSalesCount,
  } from "$lib/services/sales-dashboard";
  import {
    OFFER_VERDICT_LABELS,
    VAT_DIVISOR,
    offerReason,
    unitFoodCost,
    offerWeeks,
    type OfferDailyRow,
    type OfferDateRange,
    type OfferValue,
    type OfferVerdict,
  } from "$lib/services/sales-offers";

  let {
    open = $bindable(false),
    offer,
    brand,
    range = null,
    idealFcPerc,
    verdictVariant,
    channels,
  }: {
    open: boolean;
    offer: OfferValue | null;
    brand: string;
    /** Table date range; null = all time. */
    range?: OfferDateRange | null;
    idealFcPerc: number | null;
    verdictVariant: Record<
      OfferVerdict,
      "default" | "secondary" | "destructive" | "outline"
    >;
    /** Only orders on these channels (/sales/delivery/offers); omitted = all. */
    channels?: string[];
  } = $props();

  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  let daily = $state<OfferDailyRow[] | null>(null);
  let failed = $state(false);

  // Same endpoint and stale guard as Offer VS, with one code.
  $effect(() => {
    if (!open || !offer) return;
    const codes = [offer.code];
    let stale = false;
    daily = null;
    failed = false;
    fetch("/sales/offers/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand, codes, range, channels }),
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

  /** One point per week since the first sale: units and avg net price paid per unit. */
  const weeks = $derived.by(() => {
    if (!offer || !daily) return [];
    const catalogue = offer.sellingPrice
      ? offer.sellingPrice / VAT_DIVISOR
      : null;
    return offerWeeks(daily, offer.code).map((week) => ({
      week: new Date(week.weekStart),
      units: week.units,
      price: week.price,
      catalogue,
    }));
  });

  let exporting = $state(false);

  /** Server rebuilds the .xlsx for this offer from brand + code + range. */
  async function exportExcel() {
    if (!offer) return;
    exporting = true;
    try {
      const params = new URLSearchParams({ brands: brand, code: offer.code });
      if (range) {
        params.set("from", range.from);
        params.set("to", range.to);
      }
      if (channels) params.set("channels", channels.join(","));
      const response = await fetch(`/sales/offers/export/offer?${params}`);
      if (!response.ok) throw new Error(`Export failed (${response.status})`);
      const { downloadUrl } = (await response.json()) as {
        downloadUrl: string;
      };
      window.location.assign(downloadUrl);
    } catch {
      toast.error("The Excel export could not be generated. Try again.");
    } finally {
      exporting = false;
    }
  }

  const chartConfig = {
    units: { label: "Units", color: reasonColor(5) },
    price: { label: "Avg price paid", color: reasonColor(1) },
    catalogue: {
      label: "Today's catalogue price",
      color: "var(--muted-foreground)",
    },
  } satisfies Chart.ChartConfig;

  const weekLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

  type Step = { label: string; how: string; amount: number; total?: boolean };

  const steps = $derived.by((): Step[] => {
    if (!offer) return [];
    const perUnit = offer.units > 0 ? offer.offerNet / offer.units : 0;
    const perOrder = offer.orders > 0 ? offer.addonNet / offer.orders : 0;
    const list: Step[] = [
      {
        label: "Offer net sales",
        how: `excl. VAT, ${formatSalesAmount(perUnit)} per unit on average`,
        amount: offer.offerNet,
      },
    ];
    const unitCost = unitFoodCost(offer);
    if (offer.foodCost !== null && unitCost !== null) {
      list.push(
        {
          label: "− Food cost",
          how: offer.fcEur
            ? `${formatSalesCount(Math.round(offer.units))} units × ${formatSalesAmount(unitCost)} (catalogue FC €)`
            : `${formatSalesCount(Math.round(offer.units))} units × ${formatSalesAmount(unitCost)} (FC ${pct(offer.fcPerc ?? 0)} of ${formatSalesAmount(offer.sellingPrice ?? 0)} ÷ ${VAT_DIVISOR.toFixed(4)} VAT)`,
          amount: -offer.foodCost,
        },
        {
          label: "= Offer margin",
          how:
            offer.offerNet > 0
              ? `${pct(1 - offer.foodCost / offer.offerNet)} of offer sales`
              : "no offer sales",
          amount: offer.offerNet - offer.foodCost,
          total: true,
        },
      );
    }
    list.push({
      label: "Add-on sales",
      how: `other items in the same orders, ${formatSalesAmount(perOrder)} per order`,
      amount: offer.addonNet,
    });
    if (offer.contribution !== null && idealFcPerc !== null) {
      list.push(
        {
          label: "+ Add-on margin",
          how: `add-on sales × ${pct(1 - idealFcPerc)} (costed at the brand's ${pct(idealFcPerc)} ideal FC)`,
          amount: offer.addonNet * (1 - idealFcPerc),
        },
        {
          label: "= Contribution",
          how:
            offer.marginPct === null
              ? "no sales"
              : `${pct(offer.marginPct)} of all sales, target ${pct(1 - idealFcPerc)}`,
          amount: offer.contribution,
          total: true,
        },
      );
    }
    return list;
  });

  // Food cost uses today's catalogue price; flag offers whose real price moved.
  const priceNote = $derived.by(() => {
    if (!offer?.sellingPrice || offer.units <= 0) return null;
    const catalogue = offer.sellingPrice / VAT_DIVISOR;
    const actual = offer.offerNet / offer.units;
    return Math.abs(actual - catalogue) / catalogue > 0.1
      ? `Customers paid ${formatSalesAmount(actual)} per unit on average (excl. VAT), but today's catalogue price is ${formatSalesAmount(catalogue)}. The price changed during the offer's life, and food cost is based on today's figures, so treat the margin as approximate.`
      : null;
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
    {#if offer}
      <Dialog.Header>
        <Dialog.Title>{offer.name}</Dialog.Title>
        <Dialog.Description>
          {offer.code}{offer.channel
            ? ` · ${offer.channel}`
            : ""}{offer.category ? ` · ${offer.category}` : ""} · sold {offer.firstSale}
          → {offer.lastSale} ({formatSalesCount(offer.daysOnSale)} days), {formatSalesCount(
            Math.round(offer.units),
          )} units in {formatSalesCount(offer.orders)} orders
          {#if channels}
            · on {channels.join(", ")} only
          {/if}
        </Dialog.Description>
      </Dialog.Header>

      <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <Badge variant={verdictVariant[offer.verdict]}>
            {OFFER_VERDICT_LABELS[offer.verdict]}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            title="Breakdown, weekly and daily sales of this offer"
            onclick={exportExcel}
          >
            {#if exporting}
              <LoaderCircleIcon class="animate-spin" aria-hidden="true" />
            {:else}
              <DownloadIcon aria-hidden="true" />
            {/if}
            Export to Excel
          </Button>
        </div>
        <p class="text-sm leading-6">{offerReason(offer, idealFcPerc)}</p>
      </div>

      <Table.Root>
        <Table.Body>
          {#each steps as step (step.label)}
            <Table.Row class={step.total ? "font-medium" : ""}>
              <Table.Cell>{step.label}</Table.Cell>
              <Table.Cell
                class="text-muted-foreground text-xs whitespace-normal"
              >
                {step.how}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatSalesAmount(step.amount)}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>

      {#if priceNote}
        <p class="text-muted-foreground text-sm">{priceNote}</p>
      {/if}

      <section class="space-y-3">
        <div class="space-y-1">
          <h3 class="text-sm font-medium">Weekly sales over its life</h3>
          <p class="text-muted-foreground text-xs">
            Each point is one week from the first sale{range
              ? " in the chosen dates"
              : ""}. Margin is not charted over time because the offers
            catalogue only holds today's food cost.
          </p>
        </div>
        {#if failed}
          <p class="text-destructive text-sm">
            Could not load the weekly sales of this offer. Close and try again.
          </p>
        {:else if !daily}
          <Skeleton class="h-80 w-full" aria-busy="true" />
        {:else if weeks.length < 2}
          <p class="text-muted-foreground text-sm">
            Sold for less than two weeks; no curve to draw.
          </p>
        {:else}
          <Chart.Container config={chartConfig} class="h-40 w-full">
            <LineChart
              data={weeks}
              x="week"
              xScale={scaleUtc()}
              yPadding={[0, 16]}
              axis
              grid
              series={[
                { key: "units", label: "Units", color: "var(--color-units)" },
              ]}
              props={{
                xAxis: { format: (v: Date) => weekLabel.format(v) },
                yAxis: { format: (v: number) => formatSalesCount(v) },
              }}
            >
              {#snippet tooltip()}
                <Chart.Tooltip
                  indicator="dot"
                  labelFormatter={(v: Date) => `Week of ${weekLabel.format(v)}`}
                />
              {/snippet}
            </LineChart>
          </Chart.Container>
          <Chart.Container config={chartConfig} class="h-40 w-full">
            <LineChart
              data={weeks}
              x="week"
              xScale={scaleUtc()}
              yPadding={[16, 16]}
              axis
              grid
              legend
              series={[
                {
                  key: "price",
                  label: "Avg price paid / unit",
                  color: "var(--color-price)",
                },
                ...(weeks[0].catalogue === null
                  ? []
                  : [
                      {
                        key: "catalogue",
                        label: "Today's catalogue price",
                        color: "var(--color-catalogue)",
                      },
                    ]),
              ]}
              props={{
                xAxis: { format: (v: Date) => weekLabel.format(v) },
                // Whole euros: "€10.00" ticks clip at the chart's left edge.
                yAxis: { format: (v: number) => `€${v.toFixed(0)}` },
              }}
            >
              {#snippet marks({ context })}
                {#each context.series.visibleSeries as s (s.key)}
                  <Spline
                    seriesKey={s.key}
                    class={s.key === "catalogue"
                      ? "stroke-1 [stroke-dasharray:4_4]"
                      : "stroke-2"}
                    stroke={s.color}
                    defined={(d: Record<string, unknown>) => d[s.key] !== null}
                  />
                {/each}
              {/snippet}
              {#snippet tooltip()}
                <Chart.Tooltip
                  indicator="dot"
                  labelFormatter={(v: Date) => `Week of ${weekLabel.format(v)}`}
                />
              {/snippet}
            </LineChart>
          </Chart.Container>
        {/if}
      </section>
      <p class="text-muted-foreground text-xs leading-5">
        Not counted: full-price sales the offer may have replaced, and
        aggregator (Wolt, Bolt, Foody) commission. Both would lower the real
        result.
      </p>
    {/if}
  </Dialog.Content>
</Dialog.Root>
