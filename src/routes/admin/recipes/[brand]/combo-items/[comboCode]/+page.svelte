<script lang="ts">
  import { page } from "$app/state";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ComboComponentsTable from "$lib/components/recipes/combo-components-table.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { foodCostPercent, formatEur } from "$lib/services/recipes";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const alias = $derived(encodeURIComponent(data.brand.alias));
  const name = $derived(data.menuItem?.description ?? data.combo.code);
  // The item's own recipe wins over the component cost, as everywhere else.
  const cost = $derived(data.ownRecipe ?? data.detail);
  const foodCost = $derived(
    cost.missing === 0 && data.menuItem?.price
      ? foodCostPercent(cost.total, data.menuItem.price)
      : null,
  );
</script>

<svelte:head>
  <title>{name} · Combo items | Recipes</title>
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div class="space-y-1">
      <a
        href={`/admin/recipes/${alias}/combo-items${page.url.search}`}
        class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon class="size-4" /> Combo items
      </a>
      <p class="text-muted-foreground text-sm">
        {data.brand.name} · <span class="font-mono">{data.combo.code}</span>
        {#if data.menuItem}
          · {data.menuItem.category}
        {:else}
          · <Badge variant="outline">not on the menu</Badge>
        {/if}
      </p>
      <h1 class="text-3xl font-semibold tracking-tight">{name}</h1>
      <p class="text-muted-foreground text-sm">
        {data.combo.sold.toLocaleString("en-IE")} sold · {formatEur(
          data.combo.net,
          2,
        )} net · {data.range.from} to {data.range.to}
      </p>
    </div>
    <div class="text-right">
      <p class="text-muted-foreground text-sm">
        Material cost {data.ownRecipe ? "(own recipe)" : "(from components)"}
      </p>
      <p class="text-3xl font-semibold tabular-nums">{formatEur(cost.total)}</p>
      {#if cost.missing > 0}
        <p class="text-destructive text-xs">
          Incomplete: {cost.missing}
          {data.ownRecipe
            ? "line(s) without a SAP cost"
            : "component(s) without a recipe"}
        </p>
      {/if}
      {#if data.menuItem}
        <p class="text-muted-foreground text-xs">
          Menu price {formatEur(data.menuItem.price, 2)}
          {foodCost === null ? "" : ` · FC ${foodCost.toFixed(1)}%`}
          {foodCost === null || data.brand.labour_perc === null
            ? ""
            : ` · prime ${(foodCost + data.brand.labour_perc * 100).toFixed(1)}%`}
        </p>
      {/if}
      <Button
        class="mt-2"
        variant="outline"
        size="sm"
        href={`/admin/recipes/${alias}/${encodeURIComponent(data.combo.code)}`}
      >
        Open its recipe
      </Button>
    </div>
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title>Items in this combo</Card.Title>
      <Card.Description>
        Every item that went out attached to this combo, with how many come with
        one combo on average. Click an item to open its recipe.
      </Card.Description>
    </Card.Header>
    <Card.Content>
      <ComboComponentsTable
        brandAlias={data.brand.alias}
        components={data.detail.components}
      />
    </Card.Content>
  </Card.Root>
</main>
