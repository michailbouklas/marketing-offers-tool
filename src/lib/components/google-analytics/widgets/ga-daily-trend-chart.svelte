<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Chart from "$lib/components/ui/chart/index.js";
  import type { GoogleAnalyticsDailyPoint } from "$lib/services/google-analytics/google-analytics";
  import { scaleUtc } from "d3-scale";
  import { Area, AreaChart, LinearGradient } from "layerchart";

  let {
    data,
    title = "Daily trend",
    description = "Active users and sessions per day over the selected period.",
  }: {
    data: GoogleAnalyticsDailyPoint[];
    title?: string;
    description?: string;
  } = $props();

  const chartData = $derived(
    data.map((point) => ({
      date: new Date(`${point.day}T00:00:00Z`),
      activeUsers: point.activeUsers,
      sessions: point.sessions,
    })),
  );

  const chartConfig = {
    activeUsers: { label: "Active users", color: "var(--chart-1)" },
    sessions: { label: "Sessions", color: "var(--chart-2)" },
  } satisfies Chart.ChartConfig;

  const formatAxis = (v: Date) =>
    v.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  const formatTooltip = (v: Date) =>
    v.toLocaleDateString("en-US", {
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>{title}</Card.Title>
    <Card.Description>{description}</Card.Description>
  </Card.Header>
  <Card.Content>
    {#if chartData.length < 2}
      <p class="text-muted-foreground text-sm">
        Not enough days with data to chart yet.
      </p>
    {:else}
      <Chart.Container config={chartConfig} class="h-64 w-full">
        <AreaChart
          data={chartData}
          x="date"
          xScale={scaleUtc()}
          yPadding={[0, 16]}
          series={[
            {
              key: "sessions",
              label: "Sessions",
              color: "var(--color-sessions)",
            },
            {
              key: "activeUsers",
              label: "Active users",
              color: "var(--color-activeUsers)",
            },
          ]}
          props={{
            xAxis: { format: formatAxis },
            yAxis: { format: (v: number) => `${v}` },
          }}
        >
          {#snippet tooltip()}
            <Chart.Tooltip indicator="dot" labelFormatter={formatTooltip} />
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
                    fillOpacity={0.25}
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
  </Card.Content>
</Card.Root>
