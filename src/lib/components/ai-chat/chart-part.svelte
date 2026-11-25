<script lang="ts">
  import {
    chartErrorText,
    chartOutput,
  } from "$lib/components/ai-chat/chart-tool";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import { reasonColor } from "$lib/services/aggregator-kpis/reason-palette";
  import ChartColumnIcon from "@lucide/svelte/icons/chart-column";
  import { scaleBand } from "d3-scale";
  import { BarChart, LineChart, PieChart } from "layerchart";

  let { part }: { part: unknown } = $props();

  const output = $derived(chartOutput(part));
  const errorText = $derived(chartErrorText(part));
  const spec = $derived(output?.ok ? output : null);

  const config = $derived(
    Object.fromEntries(
      (spec?.series ?? []).map((item, index) => [
        item.key,
        { label: item.label, color: reasonColor(index) },
      ]),
    ) satisfies Chart.ChartConfig,
  );
  const series = $derived(
    (spec?.series ?? []).map((item) => ({
      key: item.key,
      label: item.label,
      color: `var(--color-${item.key})`,
    })),
  );
  // Pie: one colour per slice (row), not per series.
  const slices = $derived(
    spec?.chartType === "pie"
      ? spec.rows.map((row, index) => ({
          key: `p${index}`,
          label: row.x,
          value: Number(row.s0),
          color: reasonColor(index),
        }))
      : [],
  );
  const sliceConfig = $derived(
    Object.fromEntries(
      slices.map((slice) => [
        slice.key,
        { label: slice.label, color: slice.color },
      ]),
    ) satisfies Chart.ChartConfig,
  );

  const compact = new Intl.NumberFormat(undefined, { notation: "compact" });
  const formatAxis = (value: number) => compact.format(value);
</script>

{#if spec}
  <figure class="space-y-2 rounded-md border p-3">
    <figcaption class="text-sm font-medium">{spec.title}</figcaption>
    {#if spec.chartType === "pie"}
      <Chart.Container config={sliceConfig} class="mx-auto aspect-square h-56">
        <PieChart
          data={slices}
          key="key"
          label="label"
          value="value"
          c="color"
          innerRadius={0.6}
        >
          {#snippet tooltip()}
            <Chart.Tooltip hideLabel />
          {/snippet}
        </PieChart>
      </Chart.Container>
      <ul class="space-y-1 text-xs">
        {#each slices as slice (slice.key)}
          <li class="flex items-center gap-2">
            <span
              class="size-2.5 shrink-0 rounded-[2px]"
              style={`background-color: ${slice.color}`}
            ></span>
            <span class="flex-1">{slice.label}</span>
            <span class="tabular-nums">{slice.value.toLocaleString()}</span>
          </li>
        {/each}
      </ul>
    {:else if spec.chartType === "line"}
      <Chart.Container {config} class="h-72 w-full">
        <LineChart
          data={spec.rows}
          x="x"
          xScale={scaleBand()}
          {series}
          legend={series.length > 1}
          props={{ yAxis: { format: formatAxis } }}
        >
          {#snippet tooltip()}
            <Chart.Tooltip indicator="dot" />
          {/snippet}
        </LineChart>
      </Chart.Container>
    {:else}
      <Chart.Container {config} class="h-72 w-full">
        <BarChart
          data={spec.rows}
          x="x"
          {series}
          seriesLayout="group"
          legend={series.length > 1}
          props={{ yAxis: { format: formatAxis } }}
        >
          {#snippet tooltip()}
            <Chart.Tooltip indicator="dot" />
          {/snippet}
        </BarChart>
      </Chart.Container>
    {/if}
  </figure>
{:else if output || errorText}
  <p class="text-destructive text-xs">
    Chart failed: {errorText ??
      (output && !output.ok ? output.error : "unknown error")}
  </p>
{:else}
  <p
    class="text-muted-foreground flex animate-pulse items-center gap-1.5 text-xs"
  >
    <ChartColumnIcon class="size-3" />
    Drawing chart…
  </p>
{/if}
