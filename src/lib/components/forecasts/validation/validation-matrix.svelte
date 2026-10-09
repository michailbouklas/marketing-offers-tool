<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    buildForecastValidationHref,
    formatPct,
    type ForecastValidationFilters,
    type ForecastValidationMatrix,
    type ForecastValidationQuality,
  } from "$lib/services/forecasts/forecast-validation";

  /** Mean WAPE per brand (rows) and model (columns); best model per brand in bold. */
  let {
    matrix,
    filters,
    basePath,
  }: {
    matrix: ForecastValidationMatrix;
    filters: ForecastValidationFilters;
    basePath: string;
  } = $props();

  function toneClass(quality: ForecastValidationQuality | null): string {
    switch (quality) {
      case "high":
        return "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
      case "medium":
        return "bg-amber-500/10 text-amber-800 dark:text-amber-200";
      case "low":
        return "bg-rose-500/10 text-rose-800 dark:text-rose-200";
      default:
        return "text-muted-foreground";
    }
  }

  function cellHref(brandAlias: string, modelId: string): string {
    return buildForecastValidationHref(basePath, {
      ...filters,
      brand: brandAlias.toLowerCase(),
      model: modelId,
      status: "evaluated",
      page: 1,
    });
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Which model fits which brand</Card.Title>
    <Card.Description>
      Mean WAPE of the evaluated runs per brand and model. The lowest value in
      each row is in bold; the small number is how many runs were scored.
    </Card.Description>
  </Card.Header>
  <Card.Content>
    <div class="overflow-x-auto">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Brand</Table.Head>
            {#each matrix.models as model (model.id)}
              <Table.Head class="text-right">{model.name}</Table.Head>
            {/each}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each matrix.brands as brand (brand.alias)}
            <Table.Row>
              <Table.Cell class="font-medium">{brand.name}</Table.Cell>
              {#each matrix.models as model (model.id)}
                {@const cell = matrix.cells[brand.alias]?.[model.id]}
                {@const best =
                  matrix.bestModelByBrand[brand.alias] === model.id}
                <Table.Cell class="p-1 text-right">
                  {#if cell && cell.meanWapePct !== null}
                    <a
                      href={cellHref(brand.alias, model.id)}
                      class="block rounded-md px-2 py-1.5 tabular-nums hover:underline {toneClass(
                        cell.quality,
                      )} {best ? 'font-semibold' : ''}"
                    >
                      {formatPct(cell.meanWapePct)}
                      <span class="text-[0.65rem] opacity-70"
                        >({cell.evaluated})</span
                      >
                    </a>
                  {:else}
                    <span class="text-muted-foreground block px-2 py-1.5"
                      >—</span
                    >
                  {/if}
                </Table.Cell>
              {/each}
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  </Card.Content>
</Card.Root>
