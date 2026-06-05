<script lang="ts">
  import * as Chart from "$lib/components/ui/chart/index.js";
  import type { OfferHistory } from "$lib/services/competition/competition";
  import { scaleUtc } from "d3-scale";
  import { curveStepAfter } from "d3-shape";
  import { Area, AreaChart, LinearGradient } from "layerchart";

  type PricePoint = { date: Date; value: number };

  let { history }: { history: OfferHistory } = $props();

  // Prefer the resulting price; fall back to the discount value when the
  // scraper never captured a price for this offer.
  const usesPrice = $derived(
    history.points.some((point) => point.resultingPrice !== null),
  );
  const chartData = $derived(
    history.points
      .map((point) => ({
        date: new Date(point.effectiveAt),
        value: usesPrice ? point.resultingPrice : point.discountValue,
      }))
      .filter((point): point is PricePoint => point.value !== null),
  );
  const seriesLabel = $derived(
    usesPrice ? "Resulting price" : "Discount value",
  );

  const chartConfig = $derived({
    value: { label: seriesLabel, color: "var(--chart-1)" },
  } satisfies Chart.ChartConfig);
</script>

{#if chartData.length < 2}
  <p class="text-muted-foreground text-sm">
    Not enough price history to chart yet.
  </p>
{:else}
  <Chart.Container config={chartConfig} class="h-48 w-full">
    <AreaChart
      data={chartData}
      x="date"
      xScale={scaleUtc()}
      yPadding={[0, 16]}
      series={[
        {
          key: "value",
          label: seriesLabel,
          color: "var(--color-value)",
        },
      ]}
      props={{
        xAxis: {
          format: (v: Date) =>
            v.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        },
        yAxis: { format: (v: number) => `${v}` },
      }}
    >
      {#snippet tooltip()}
        <Chart.Tooltip
          indicator="dot"
          labelFormatter={(v: Date) =>
            v.toLocaleString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
        />
      {/snippet}
      {#snippet marks({ context })}
        {#each context.series.visibleSeries as s (s.key)}
          <LinearGradient
            stops={[
              s.color ?? "",
              "color-mix(in lch, " + s.color + " 10%, transparent)",
            ]}
            vertical
          >
            {#snippet children({ gradient })}
              <Area
                seriesKey={s.key}
                curve={curveStepAfter}
                fillOpacity={0.4}
                line={{ class: "stroke-1" }}
                motion="tween"
                {...s.props}
                fill={gradient}
              />
            {/snippet}
          </LinearGradient>
        {/each}
      {/snippet}
    </AreaChart>
  </Chart.Container>
{/if}
