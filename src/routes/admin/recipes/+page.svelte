<script lang="ts">
  import { goto } from "$app/navigation";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import LabourToggle from "$lib/components/recipes/labour-toggle.svelte";
  import RecipeImportDialog from "$lib/components/recipes/recipe-import-dialog.svelte";
  import RecipeItemDialog from "$lib/components/recipes/recipe-item-dialog.svelte";
  import RecipeItemsGrid, {
    type RecipeGridRow,
  } from "$lib/components/recipes/recipe-items-grid.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { primeCostPercent, recipeHref } from "$lib/services/recipes";
  import { toast } from "svelte-sonner";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let importOpen = $state(false);
  let detailOpen = $state(false);
  let detail = $state<RecipeGridRow | null>(null);
  let grid = $state<ReturnType<typeof RecipeItemsGrid>>();
  let exporting = $state(false);
  let visibleCount = $state(0);

  // Only rows with a POS price can have a food cost %: half the POS menu is
  // priced 0 (components, coupons, notes) and unlinked recipes have no POS item.
  let pricedOnly = $state(true);
  let activeOnly = $state(true);
  // The grid is about stored recipes; POS items without one are opt-in (to
  // check coverage or start a recipe from a POS item).
  let showNoRecipe = $state(false);
  const inScope = $derived(
    showNoRecipe ? data.rows : data.rows.filter((row) => row.id !== null),
  );
  // With labour on, cost % is prime cost % (food + labour) and so is the target.
  let includeLabour = $state(false);
  const labourFraction = $derived(
    includeLabour ? (data.brand?.labour_perc ?? 0) : 0,
  );
  const target = $derived(
    data.brand?.ideal_fc_perc == null
      ? null
      : (data.brand.ideal_fc_perc + labourFraction) * 100,
  );

  const rows = $derived.by((): RecipeGridRow[] =>
    inScope
      .filter(
        (row) =>
          (!pricedOnly || row.price !== null) && (!activeOnly || row.active),
      )
      .map((row) => {
        // Only complete recipes: a partial cost would understate food cost.
        const percent =
          row.cost !== null && row.price !== null && row.missing === 0
            ? primeCostPercent(row.cost, row.price, labourFraction)
            : null;
        return {
          ...row,
          cost_percent: percent,
          over_target: percent !== null && target !== null && percent > target,
        };
      }),
  );

  const count = (status: string) =>
    data.rows.filter((row) => row.status === status).length;
  const recipeCount = $derived(
    data.rows.filter((row) => row.id !== null).length,
  );
  const pricedWithoutRecipe = $derived(
    data.rows.filter(
      (row) => row.status === "No recipe" && row.price !== null && row.active,
    ).length,
  );

  function open(row: RecipeGridRow) {
    if (row.id === null) {
      goto(recipeHref(data.brand?.alias ?? "", { itemCode: row.item_code }));
      return;
    }
    detail = row;
    detailOpen = true;
  }

  /** Excel of the grid's filtered + sorted rows; the server re-reads the values. */
  async function exportExcel() {
    const keys = grid?.visibleKeys() ?? [];
    if (keys.length === 0) {
      toast.error("No rows match the current filters.");
      return;
    }
    exporting = true;
    const toastId = toast.loading("Preparing the Excel export…");
    try {
      const response = await fetch("/admin/recipes/items/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brand: data.brand?.alias, keys }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? `Export failed (${response.status})`);
      }
      const { downloadUrl } = (await response.json()) as {
        downloadUrl: string;
      };
      window.location.assign(downloadUrl);
      toast.success(`Excel export of ${keys.length} rows ready, downloading.`, {
        id: toastId,
      });
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "The Excel export could not be generated.",
        { id: toastId },
      );
    } finally {
      exporting = false;
    }
  }
</script>

<svelte:head>
  <title>Recipes | Admin</title>
</svelte:head>

<main
  class="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8"
>
  <div class="space-y-1">
    <h1 class="text-3xl font-semibold tracking-tight">Recipes</h1>
    <p class="text-muted-foreground text-sm">
      The brand's recipes, imported from its cost workbook, with their SAP
      material cost.
    </p>
  </div>

  {#if data.brands.length === 0}
    <Card.Root>
      <Card.Content class="text-muted-foreground py-8 text-sm">
        You have no brands assigned. Ask an admin to assign you a brand.
      </Card.Content>
    </Card.Root>
  {:else}
    <ButtonGroup.Root class="flex-wrap">
      {#each data.brands as brand (brand.id)}
        <Button
          variant={data.brand?.id === brand.id ? "default" : "outline"}
          href={`/admin/recipes?brand=${encodeURIComponent(brand.alias)}`}
        >
          {brand.name}
        </Button>
      {/each}
    </ButtonGroup.Root>

    {#if data.brand}
      <Card.Root class="min-w-0">
        <Card.Header class="flex flex-row flex-wrap items-center gap-3">
          <Card.Title class="mr-auto">
            {data.brand.name}
            <span class="text-muted-foreground text-sm font-normal">
              {recipeCount} recipes · {count("Linked")} linked to a POS item ·
              {recipeCount - count("Linked")} unlinked · {pricedWithoutRecipe} priced
              POS items without a recipe
            </span>
          </Card.Title>
          <Button
            variant="outline"
            href={`/admin/recipes/menu?brand=${encodeURIComponent(data.brand.alias)}`}
          >
            Menu
          </Button>
          <Button
            variant="outline"
            href={`/admin/recipes/engineering?brand=${encodeURIComponent(data.brand.alias)}`}
          >
            Menu engineering
          </Button>
          <Button variant="outline" disabled={exporting} onclick={exportExcel}>
            {#if exporting}
              <LoaderCircleIcon class="size-4 animate-spin" />
              Working…
            {:else}
              <DownloadIcon class="size-4" />
              Export to Excel
            {/if}
          </Button>
          <Button onclick={() => (importOpen = true)}>Import workbook</Button>
        </Card.Header>
        <Card.Content class="space-y-3">
          <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div class="flex items-center gap-2">
              <Switch id="priced-only" bind:checked={pricedOnly} />
              <label for="priced-only">Priced only</label>
              <span class="text-muted-foreground text-xs">
                (hides POS items priced 0 and recipes not linked to a POS item)
              </span>
            </div>
            <div class="flex items-center gap-2">
              <Switch id="active-only" bind:checked={activeOnly} />
              <label for="active-only">Active only</label>
            </div>
            <div class="flex items-center gap-2">
              <Switch id="show-no-recipe" bind:checked={showNoRecipe} />
              <label for="show-no-recipe">Show POS items without a recipe</label
              >
            </div>
            <LabourToggle
              labourPerc={data.brand.labour_perc}
              bind:checked={includeLabour}
            />
            <span class="text-muted-foreground text-xs">
              Cost % = {includeLabour
                ? "prime cost (food + labour)"
                : "food cost"}
              ÷ price ex VAT{target === null
                ? ""
                : `, red above the ${target.toFixed(1)}% target`}.
            </span>
          </div>
          <p class="text-sm" role="status" aria-live="polite">
            <span class="font-medium tabular-nums"
              >{visibleCount.toLocaleString("en-IE")}</span
            >
            {visibleCount === 1 ? "item" : "items"}
            {#if visibleCount !== inScope.length}
              <span class="text-muted-foreground">
                of {inScope.length.toLocaleString("en-IE")}
              </span>
            {/if}
          </p>
          {#if recipeCount === 0 && !showNoRecipe}
            <p
              class="text-muted-foreground rounded-md border border-dashed p-6 text-sm"
            >
              {data.brand.name} has no recipes yet. Import its cost workbook, or turn
              on "Show POS items without a recipe" to build one from a POS item.
            </p>
          {/if}
          <div class="h-[70vh] min-h-96 overflow-hidden rounded-xl border">
            <RecipeItemsGrid
              bind:this={grid}
              bind:visibleCount
              columnState={data.columnState}
              {rows}
              onOpen={open}
            />
          </div>
        </Card.Content>
      </Card.Root>

      <RecipeImportDialog bind:open={importOpen} brand={data.brand} />
      <RecipeItemDialog
        bind:open={detailOpen}
        item={detail}
        brandAlias={data.brand.alias}
      />
    {/if}
  {/if}
</main>
