<script lang="ts">
  import { page } from "$app/state";
  import ForecastControlsBar from "$lib/components/forecasts/widgets/forecast-controls-bar.svelte";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    buildForecastHref,
    parseForecastFilters,
    type ForecastFilters,
  } from "$lib/services/forecasts/forecast-types";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import type { Snippet } from "svelte";
  import type { LayoutData } from "./$types";

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  const OVERVIEW_PATH = "/forecasts";
  const COMPARE_PATH = "/forecasts/compare";

  const models = $derived(data.models);

  // Pages own the resolved filters (brand normalised to the stored alias);
  // fall back to parsing the URL so the shell also works on error pages.
  const pageFilters = $derived(
    (page.data.filters as ForecastFilters | undefined) ??
      parseForecastFilters(page.url.searchParams, models),
  );

  // Links and the model pickers follow the URL, not the deep-dive page's
  // forced single-model filter, so the user's selection survives tab changes.
  const urlFilters = $derived<ForecastFilters>({
    ...parseForecastFilters(page.url.searchParams, models),
    brand: pageFilters.brand,
  });

  const historyDays = $derived(
    (page.data.historyDays as number | null | undefined) ?? null,
  );

  const isModelPage = $derived(
    page.url.pathname !== OVERVIEW_PATH && page.url.pathname !== COMPARE_PATH,
  );

  const tabs = $derived([
    { href: OVERVIEW_PATH, label: "Overview" },
    { href: COMPARE_PATH, label: "Compare models" },
    ...models.map((model) => ({
      href: `${OVERVIEW_PATH}/${model.id}`,
      label: model.name,
    })),
  ]);

  function tabHref(path: string): string {
    return buildForecastHref(path, urlFilters, models);
  }

  function isActive(path: string): boolean {
    return page.url.pathname === path;
  }
</script>

<svelte:head>
  <title>Sales Forecasts | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Per-brand sales forecasts from the POS warehouse: expected revenue for the coming weeks, with likely ranges and how much to trust each model."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-3)_18%,transparent),transparent_34%),radial-gradient(circle_at_88%_14%,_color-mix(in_oklab,var(--color-chart-1)_18%,transparent),transparent_26%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section class="space-y-3">
      <Badge
        variant="outline"
        class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
      >
        Sales Forecasts
      </Badge>
      <div class="space-y-2">
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Sales Forecasts
        </h1>
        <p class="text-muted-foreground max-w-3xl text-base leading-7">
          What a brand is likely to sell over the coming weeks, based on its own
          daily sales history. Pick a brand, one or more forecasting methods and
          a horizon — each method runs on its own so you can see where they
          agree.
        </p>
        <p class="text-muted-foreground/80 max-w-3xl text-sm leading-6">
          Forecasts start from the last day with recorded sales, not today. The
          shaded band is the range the actual figure is likely to land in.
        </p>
      </div>
    </section>

    {#if data.engineStatus === "unavailable"}
      <Alert.Root variant="destructive">
        <TriangleAlertIcon />
        <Alert.Title>The forecast service is unavailable right now</Alert.Title>
        <Alert.Description>
          We could not reach the forecasting service, so no models are listed.
          Reload in a moment — if it keeps happening, tell the data team.
        </Alert.Description>
      </Alert.Root>
    {/if}

    <ForecastControlsBar
      brands={data.brands}
      {models}
      filters={urlFilters}
      {historyDays}
      basePath={page.url.pathname}
      compareBasePath={COMPARE_PATH}
      showModels={!isModelPage}
    />

    <nav aria-label="Forecast views" class="flex flex-wrap gap-1 border-b">
      {#each tabs as tab (tab.href)}
        <Button
          variant="ghost"
          size="sm"
          href={tabHref(tab.href)}
          aria-current={isActive(tab.href) ? "page" : undefined}
          class="rounded-b-none border-b-2 {isActive(tab.href)
            ? 'border-primary text-foreground'
            : 'text-muted-foreground border-transparent'}"
        >
          {tab.label}
        </Button>
      {/each}
    </nav>

    {@render children()}
  </main>
</div>
