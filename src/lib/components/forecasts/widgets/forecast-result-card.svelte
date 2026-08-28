<script lang="ts">
  import KpiStatCards from "$lib/components/aggregator-kpis/widgets/kpi-stat-cards.svelte";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    cardStatusSentence,
    forecastWarningCopy,
    kpiTiles,
    weekdayNote,
  } from "$lib/services/forecasts/forecast-narrative";
  import {
    forecastHorizonLabels,
    isForecastHorizon,
    type ForecastModel,
    type ForecastResult,
    type ModelStroke,
  } from "$lib/services/forecasts/forecast-types";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import MapPinIcon from "@lucide/svelte/icons/map-pin";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import AnalystDetails from "./analyst-details.svelte";
  import ConfidenceBadge from "./confidence-badge.svelte";
  import ConfidenceRow from "./confidence-row.svelte";
  import ForecastChart from "./forecast-chart.svelte";
  import ForecastHeadline from "./forecast-headline.svelte";
  import ModelSwatch from "./model-swatch.svelte";
  import SeasonalityChips from "./seasonality-chips.svelte";

  let {
    result,
    model = null,
    stroke,
    detailsHref = null,
    onRefresh,
    variant = "summary",
    showWideBand = variant === "full",
  }: {
    result: ForecastResult;
    /** Catalog entry (for the description); null when the catalog is stale. */
    model?: ForecastModel | null;
    stroke: ModelStroke;
    /** Link to `/forecasts/[modelId]`; omitted on the deep-dive page itself. */
    detailsHref?: string | null;
    onRefresh: () => void;
    /** `full` = deep-dive page: taller chart, every chip, 95 % band. */
    variant?: "summary" | "full";
    showWideBand?: boolean;
  } = $props();

  const tiles = $derived(kpiTiles(result));
  const note = $derived(weekdayNote(result.seasonality));
  const horizonLabel = $derived(
    isForecastHorizon(result.horizonDays)
      ? forecastHorizonLabels[result.horizonDays]
      : `Next ${result.horizonDays} days`,
  );
</script>

<Card.Root class="flex h-full flex-col">
  <Card.Header>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <ModelSwatch {stroke} />
          <Card.Title>{result.modelName}</Card.Title>
          <Badge variant="outline">{horizonLabel}</Badge>
          {#if result.locationName}
            <Badge variant="secondary">
              <MapPinIcon class="size-3" />
              {result.locationName}
            </Badge>
          {/if}
          <ConfidenceBadge accuracy={result.accuracy} />
        </div>
        {#if model?.description}
          <Card.Description>{model.description}</Card.Description>
        {/if}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onclick={onRefresh}
        aria-label="Refresh the {result.modelName} forecast"
      >
        <RefreshCwIcon />
        Refresh
      </Button>
    </div>
  </Card.Header>

  <Card.Content class="flex flex-1 flex-col gap-5">
    <p class="sr-only">
      {cardStatusSentence(result.modelName, "ready", result)}
    </p>

    <ForecastHeadline {result} />

    <div class={variant === "summary" ? "[&>div]:lg:grid-cols-2!" : ""}>
      <KpiStatCards data={tiles} />
    </div>

    <ForecastChart
      {result}
      {stroke}
      {showWideBand}
      class={variant === "full" ? "h-80" : "h-64"}
    />

    <ConfidenceRow accuracy={result.accuracy} />

    {#if note}
      <p class="text-muted-foreground text-sm">{note}</p>
    {/if}

    <SeasonalityChips
      seasonality={result.seasonality}
      max={variant === "full" ? 12 : 4}
    />

    {#if result.warnings.length > 0}
      <Alert.Root class="bg-muted/40">
        <TriangleAlertIcon />
        <Alert.Title>Things to keep in mind</Alert.Title>
        <Alert.Description>
          <ul class="list-disc space-y-1 pl-4">
            {#each result.warnings as warning (warning.code + warning.message)}
              <li>{forecastWarningCopy(warning.code, warning.message)}</li>
            {/each}
          </ul>
        </Alert.Description>
      </Alert.Root>
    {/if}

    <AnalystDetails {result} />
  </Card.Content>

  {#if detailsHref}
    <Card.Footer class="justify-end">
      <Button variant="link" href={detailsHref}>
        Open details
        <ArrowRightIcon />
      </Button>
    </Card.Footer>
  {/if}
</Card.Root>
