<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    costRecipe,
    foodCostPercent,
    formatEur,
    recipeHref,
  } from "$lib/services/recipes";
  import type { RecipeLineView } from "$lib/services/recipes.server";
  import type { RecipeGridRow } from "./recipe-items-grid.svelte";

  let {
    open = $bindable(false),
    item,
    brandAlias,
  }: {
    open?: boolean;
    /** A stored recipe's row (`id` set); POS items without one never open it. */
    item: RecipeGridRow | null;
    brandAlias: string;
  } = $props();

  let lines = $state<RecipeLineView[]>([]);
  let loading = $state(false);
  let failed = $state(false);

  $effect(() => {
    if (!open || item?.id == null) return;
    const id = item.id;
    let stale = false;
    lines = [];
    loading = true;
    failed = false;
    fetch(`/admin/recipes/items/${id}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as { lines: RecipeLineView[] };
        if (!stale) lines = body.lines;
      })
      .catch(() => {
        if (!stale) failed = true;
      })
      .finally(() => {
        if (!stale) loading = false;
      });
    return () => {
      stale = true;
    };
  });

  const costed = $derived(
    lines.map((line) => ({
      ...line,
      unit_cost: line.sap?.item_cost ?? null,
      cost:
        line.sap?.item_cost == null ? null : line.quantity * line.sap.item_cost,
    })),
  );
  const totals = $derived(costRecipe(costed));

  const quantity = (value: number | null) =>
    value === null
      ? ""
      : value.toLocaleString("en-IE", { maximumFractionDigits: 4 });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-5xl">
    <Dialog.Header>
      <Dialog.Title>{item?.name}</Dialog.Title>
      <Dialog.Description>
        {#if item?.item_code}
          POS item <span class="font-mono text-xs">{item.item_code}</span>
          {item.pos_name}
        {:else}
          Not linked to a POS item ({item?.status.toLowerCase()}).
        {/if}
        Cost = purchasing quantity × current SAP cost.
      </Dialog.Description>
    </Dialog.Header>

    {#if loading}
      <p class="text-muted-foreground text-sm" role="status">Loading…</p>
    {:else if failed}
      <p class="text-destructive text-sm" role="alert">
        The recipe could not be loaded. Close and try again.
      </p>
    {:else}
      <div class="max-h-[60vh] overflow-y-auto rounded-md border">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>SAP code</Table.Head>
              <Table.Head>Material</Table.Head>
              <Table.Head class="text-right">Recipe qty</Table.Head>
              <Table.Head class="text-right">Purchasing qty</Table.Head>
              <Table.Head>Unit</Table.Head>
              <Table.Head class="text-right">SAP unit cost</Table.Head>
              <Table.Head class="text-right">Cost</Table.Head>
              <Table.Head class="text-right">Share</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each costed as line (line.database_id + "|" + line.item_number)}
              <Table.Row>
                <Table.Cell class="font-mono text-xs">
                  {line.item_number}
                </Table.Cell>
                <Table.Cell class="whitespace-normal">
                  {line.sap?.item_description ?? line.saved_description}
                  {#if !line.sap}
                    <Badge variant="destructive">Not in SAP</Badge>
                  {:else if line.sap.inactive}
                    <Badge variant="outline">Inactive in SAP</Badge>
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {quantity(line.recipe_quantity)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {quantity(line.quantity)}
                </Table.Cell>
                <Table.Cell>
                  {line.sap?.purchasing_uom ?? line.saved_uom}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {#if line.unit_cost === null}
                    <Badge variant="outline">No cost</Badge>
                  {:else}
                    {formatEur(line.unit_cost)}
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {line.cost === null ? "" : formatEur(line.cost)}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {line.cost === null || !(totals.total > 0)
                    ? ""
                    : `${((line.cost / totals.total) * 100).toFixed(1)}%`}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>

      <dl class="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <dt class="text-muted-foreground">Material cost</dt>
          <dd class="font-medium tabular-nums">{formatEur(totals.total)}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Materials</dt>
          <dd class="font-medium tabular-nums">{lines.length}</dd>
        </div>
        {#if totals.missing > 0}
          <div>
            <dt class="text-muted-foreground">Without cost</dt>
            <dd class="text-destructive font-medium tabular-nums">
              {totals.missing} (total is incomplete)
            </dd>
          </div>
        {/if}
        {#if item?.price != null}
          <div>
            <dt class="text-muted-foreground">POS price</dt>
            <dd class="font-medium tabular-nums">{formatEur(item.price, 2)}</dd>
          </div>
        {:else if item?.no_pos_price}
          <div>
            <dt class="text-muted-foreground">POS price</dt>
            <dd class="text-muted-foreground">€0.00 in POS: no food cost %</dd>
          </div>
        {:else if item && !item.item_code}
          <div>
            <dt class="text-muted-foreground">POS price</dt>
            <dd class="text-muted-foreground">no POS item linked</dd>
          </div>
        {/if}
        {#if item?.price != null && totals.missing === 0}
          <div>
            <dt class="text-muted-foreground">Food cost</dt>
            <dd class="font-medium tabular-nums">
              {foodCostPercent(totals.total, item.price)?.toFixed(1)}%
            </dd>
          </div>
        {/if}
      </dl>
    {/if}

    {#if item?.id != null}
      <Dialog.Footer>
        <Button
          variant="outline"
          href={recipeHref(brandAlias, { id: item.id })}
        >
          Open recipe page
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
