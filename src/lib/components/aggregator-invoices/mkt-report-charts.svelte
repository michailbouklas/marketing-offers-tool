<script lang="ts">
  import * as Chart from "$lib/components/ui/chart/index.js";
  import { formatInvoiceAmount } from "$lib/services/aggregator-invoices/aggregator-invoices";
  import type { MktReport } from "$lib/services/aggregator-invoices/mkt-report";
  import { reasonColor } from "$lib/services/aggregator-kpis/reason-palette";
  import { BarChart, LineChart } from "layerchart";

  let { report }: { report: MktReport } = $props();

  const TOP_STORES = 15;

  const config = {
    wolt: { label: "Wolt", color: reasonColor(0) },
    bolt: { label: "Bolt", color: reasonColor(1) },
    total: { label: "Total", color: reasonColor(2) },
  } satisfies Chart.ChartConfig;

  const compactEuro = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
  });
  const pct = (v: number) => `${v.toFixed(1)}%`;

  const monthly = $derived(
    report.byMonth.map((m) => ({
      month: m.month,
      wolt: Math.round(m.wolt.gross * 100) / 100,
      bolt: Math.round(m.bolt.gross * 100) / 100,
    })),
  );
  const topStores = $derived(
    report.byStore.slice(0, TOP_STORES).map((s) => ({
      store: s.store,
      total: Math.round(s.total.gross * 100) / 100,
    })),
  );
  // Months without sales on their marketing invoices have no ratio.
  const share = $derived(
    report.byMonth
      .filter((m) => m.total.pctOfSales !== null)
      .map((m) => ({
        date: new Date(`${m.month}-01T00:00:00Z`),
        total: Math.round((m.total.pctOfSales ?? 0) * 100) / 100,
      })),
  );
</script>

{#snippet euroTooltip()}
  <Chart.Tooltip indicator="dot">
    {#snippet formatter({ value, name, item })}
      <div
        style="--color-bg: {item.color}"
        class="size-2.5 shrink-0 rounded-[2px] bg-(--color-bg)"
      ></div>
      <div class="flex flex-1 items-center justify-between gap-4 leading-none">
        <span class="text-muted-foreground">{name}</span>
        <span class="text-foreground font-mono font-medium tabular-nums">
          {formatInvoiceAmount(typeof value === "number" ? value : null)}
        </span>
      </div>
    {/snippet}
  </Chart.Tooltip>
{/snippet}

<div class="grid gap-8 lg:grid-cols-2">
  <section class="space-y-3 lg:col-span-2">
    <h3 class="text-sm font-medium">Monthly marketing spend (incl. VAT)</h3>
    <Chart.Container {config} class="h-80 w-full">
      <BarChart
        data={monthly}
        x="month"
        seriesLayout="stack"
        legend
        series={[
          { key: "wolt", label: "Wolt", color: "var(--color-wolt)" },
          { key: "bolt", label: "Bolt", color: "var(--color-bolt)" },
        ]}
        props={{ yAxis: { format: (v: number) => compactEuro.format(v) } }}
      >
        {#snippet tooltip()}
          {@render euroTooltip()}
        {/snippet}
      </BarChart>
    </Chart.Container>
  </section>

  <section class="space-y-3">
    <h3 class="text-sm font-medium">
      Top {Math.min(TOP_STORES, topStores.length)} stores by marketing spend
    </h3>
    <Chart.Container {config} class="h-[28rem] w-full">
      <BarChart
        data={topStores}
        y="store"
        orientation="horizontal"
        padding={{ left: 160 }}
        series={[{ key: "total", label: "Total", color: "var(--color-total)" }]}
        props={{ xAxis: { format: (v: number) => compactEuro.format(v) } }}
      >
        {#snippet tooltip()}
          {@render euroTooltip()}
        {/snippet}
      </BarChart>
    </Chart.Container>
  </section>

  <section class="space-y-3">
    <h3 class="text-sm font-medium">Marketing as % of sales, per month</h3>
    <p class="text-muted-foreground text-xs">
      Marketing gross ÷ SAL gross on the same invoices.
    </p>
    {#if share.length < 2}
      <p class="text-muted-foreground text-sm">
        Not enough months to chart for the current filters.
      </p>
    {:else}
      <Chart.Container {config} class="h-[24rem] w-full">
        <LineChart
          data={share}
          x="date"
          series={[
            { key: "total", label: "% of sales", color: "var(--color-total)" },
          ]}
          props={{
            xAxis: {
              format: (v: Date) =>
                v.toLocaleDateString("en-GB", {
                  month: "short",
                  year: "2-digit",
                }),
            },
            yAxis: { format: pct },
          }}
        >
          {#snippet tooltip()}
            <Chart.Tooltip
              indicator="dot"
              labelFormatter={(v: Date) =>
                v.toLocaleDateString("en-GB", {
                  month: "long",
                  year: "numeric",
                })}
            >
              {#snippet formatter({ value, name })}
                <div class="flex flex-1 items-center justify-between gap-4">
                  <span class="text-muted-foreground">{name}</span>
                  <span class="font-mono tabular-nums">
                    {typeof value === "number" ? pct(value) : "–"}
                  </span>
                </div>
              {/snippet}
            </Chart.Tooltip>
          {/snippet}
        </LineChart>
      </Chart.Container>
    {/if}
  </section>
</div>
