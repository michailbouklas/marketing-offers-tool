<script lang="ts">
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { superForm } from "sveltekit-superforms/client";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SearchIcon from "@lucide/svelte/icons/search";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import SapItemSearchDialog from "$lib/components/sap/sap-item-search-dialog.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import {
    costRecipe,
    exVatPrice,
    foodCostPercent,
    formatEur,
    idealPriceForMargin,
    marginOfPrice,
    PRICE_POINT_ENDINGS,
    roundUpToPricePoint,
    type PricePointEnding,
    type SapItem,
  } from "$lib/services/recipes";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const key = (line: { database_id: string; item_number: string }) =>
    `${line.database_id}|${line.item_number}`;

  // Live SAP rows for the lines, keyed by database_id|item_number.
  let sapInfo = $state<Record<string, SapItem>>(
    untrack(() =>
      Object.fromEntries(
        (data.recipe?.lines ?? [])
          .filter((line) => line.sap)
          .map((line) => [key(line), line.sap as SapItem]),
      ),
    ),
  );
  let lookupErrors = $state<Record<number, string>>({});
  let dialogOpen = $state(false);
  let dialogRow = $state(0);
  let dialogInitial = $state("");

  const { form, errors, enhance, submitting, tainted } = superForm(
    untrack(() => data.form),
    {
      dataType: "json",
      resetForm: false,
      invalidateAll: true,
      onUpdated: ({ form: result }) => {
        if (result.message) toast.success(String(result.message));
        else if (!result.valid) toast.error("Fix the highlighted rows");
      },
    },
  );

  const cost = $derived(
    costRecipe(
      $form.lines.map((line) => ({
        quantity: Number(line.quantity),
        unit_cost: sapInfo[key(line)]?.item_cost ?? null,
      })),
    ),
  );

  // Prefilled from the brand's food-cost target; not saved.
  let marginPercent = $state<number | null>(
    untrack(() =>
      data.brand.ideal_fc_perc === null
        ? null
        : Math.round((1 - data.brand.ideal_fc_perc) * 1000) / 10,
    ),
  );
  const marginValid = $derived(
    marginPercent !== null && marginPercent >= 0 && marginPercent < 100,
  );
  const idealPrice = $derived(
    marginValid && cost.total > 0
      ? idealPriceForMargin(cost.total, Number(marginPercent))
      : null,
  );
  const menuPrice = $derived(data.menuItem?.price ?? 0);
  const currentMargin = $derived(
    cost.total > 0 ? marginOfPrice(cost.total, menuPrice) : null,
  );
  // item_price is VAT-inclusive, cost is not: compare on the ex-VAT price.
  const priceDifference = $derived(exVatPrice(menuPrice) - cost.total);

  const signedEur = (value: number, digits = 2) =>
    `${value >= 0 ? "+" : "−"}${formatEur(Math.abs(value), digits)}`;

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const foodCost = $derived(
    cost.total > 0 ? foodCostPercent(cost.total, menuPrice) : null,
  );
  const targetFoodCost = $derived(
    data.brand.ideal_fc_perc === null ? null : data.brand.ideal_fc_perc * 100,
  );

  // Same recipe re-priced at SAP's last purchase price (0 = no price).
  const latestCost = $derived(
    costRecipe(
      $form.lines.map((line) => ({
        quantity: Number(line.quantity),
        unit_cost: sapInfo[key(line)]?.last_purchase_price || null,
      })),
    ),
  );
  const latestChange = $derived(
    cost.total > 0 && latestCost.missing === 0
      ? ((latestCost.total - cost.total) / cost.total) * 100
      : null,
  );

  // Share of plate cost per line; "key" lines together make up the top 80%.
  const lineShares = $derived.by(() => {
    const costs = $form.lines.map((line) => {
      const unit = line.database_id ? sapInfo[key(line)]?.item_cost : null;
      return unit == null ? 0 : Number(line.quantity) * unit;
    });
    const shares = costs.map((value) =>
      cost.total > 0 ? (value / cost.total) * 100 : 0,
    );
    const key80 = new Set<number>();
    let running = 0;
    for (const index of shares
      .map((_, i) => i)
      .sort((a, b) => shares[b] - shares[a])) {
      if (running >= 80 || shares[index] <= 0) break;
      key80.add(index);
      running += shares[index];
    }
    return { shares, key80 };
  });

  let pricePoint = $state<PricePointEnding>(".50");
  const roundedPrice = $derived(
    idealPrice === null ? null : roundUpToPricePoint(idealPrice, pricePoint),
  );

  function addLine() {
    $form.lines = [
      ...$form.lines,
      { database_id: "", item_number: "", quantity: 0 },
    ];
  }

  function removeLine(index: number) {
    $form.lines = $form.lines.filter((_, i) => i !== index);
    lookupErrors = {};
  }

  function applyItem(index: number, item: SapItem) {
    sapInfo[key(item)] = item;
    $form.lines[index].database_id = item.database_id;
    $form.lines[index].item_number = item.item_number;
    delete lookupErrors[index];
  }

  function openSearch(index: number) {
    dialogRow = index;
    dialogInitial = $form.lines[index].item_number;
    dialogOpen = true;
  }

  // Typed item number: resolve it exactly; ambiguous → let the user pick.
  async function lookup(index: number) {
    const line = $form.lines[index];
    const itemNumber = line.item_number.trim();
    if (!itemNumber) return;
    if (line.database_id && sapInfo[key(line)]) return;

    const params = new URLSearchParams({
      brand: data.brand.alias,
      item_number: itemNumber,
      exact: "1",
    });
    const response = await fetch(`/api/sap-items?${params}`);
    if (!response.ok) {
      lookupErrors[index] = `Lookup failed (${response.status})`;
      return;
    }
    const { items } = (await response.json()) as { items: SapItem[] };
    if (items.length === 1) applyItem(index, items[0]);
    else if (items.length > 1) openSearch(index);
    else {
      $form.lines[index].database_id = "";
      lookupErrors[index] = `Item ${itemNumber} not found`;
    }
  }

  function onItemNumberInput(index: number) {
    // Editing the number invalidates the previously resolved SAP row.
    $form.lines[index].database_id = "";
    delete lookupErrors[index];
  }
</script>

<svelte:head>
  <title>{data.menuItem?.description ?? data.itemCode} | Recipes</title>
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
  <div class="flex flex-wrap items-start gap-4">
    <Button
      variant="ghost"
      size="icon"
      href={`/admin/recipes?brand=${encodeURIComponent(data.brand.alias)}`}
      aria-label="Back to menu"
    >
      <ArrowLeftIcon />
    </Button>
    <div class="mr-auto space-y-1">
      <p class="text-muted-foreground text-sm">
        {data.brand.name} · <span class="font-mono">{data.itemCode}</span>
        {#if data.menuItem}
          · {data.menuItem.category}
          {#if !data.menuItem.active}
            · <Badge variant="outline">inactive</Badge>
          {/if}
        {:else}
          · <Badge variant="destructive">not on the menu</Badge>
        {/if}
      </p>
      <h1 class="text-3xl font-semibold tracking-tight">
        {data.menuItem?.description ?? data.itemCode}
      </h1>
    </div>
    <div class="text-right">
      <p class="text-muted-foreground text-sm">Material cost</p>
      <p class="text-3xl font-semibold tabular-nums">{formatEur(cost.total)}</p>
      {#if cost.missing > 0}
        <p class="text-destructive text-xs">
          Incomplete: {cost.missing} line(s) without a SAP cost
        </p>
      {/if}
      {#if data.menuItem}
        <p class="text-muted-foreground text-xs">
          Menu price {formatEur(data.menuItem.price, 2)}
        </p>
      {/if}
    </div>
  </div>

  <form method="POST" action="?/save" use:enhance>
    <Card.Root>
      <Card.Header class="flex flex-row items-center gap-3">
        <Card.Title class="mr-auto">Recipe materials</Card.Title>
        <Button type="button" variant="outline" onclick={addLine}>
          <PlusIcon /> Add
        </Button>
        <Button type="submit" disabled={$submitting || !$tainted}>
          {$submitting ? "Saving…" : "Save"}
        </Button>
      </Card.Header>
      <Card.Content>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head class="w-56">Item number</Table.Head>
              <Table.Head>Description</Table.Head>
              <Table.Head class="w-36">Quantity</Table.Head>
              <Table.Head>Unit</Table.Head>
              <Table.Head class="text-right">Unit cost</Table.Head>
              <Table.Head class="text-right">Line cost</Table.Head>
              <Table.Head class="w-32">% of cost</Table.Head>
              <Table.Head class="w-10"
                ><span class="sr-only">Remove</span></Table.Head
              >
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each $form.lines as line, index (index)}
              {@const info = line.database_id ? sapInfo[key(line)] : undefined}
              {@const rowError =
                lookupErrors[index] ??
                $errors.lines?.[index]?.item_number?.[0] ??
                $errors.lines?.[index]?.database_id?.[0]}
              <Table.Row>
                <Table.Cell class="align-top">
                  <InputGroup.Root>
                    <InputGroup.Input
                      aria-label="Item number"
                      aria-invalid={rowError ? true : undefined}
                      bind:value={$form.lines[index].item_number}
                      oninput={() => onItemNumberInput(index)}
                      onblur={() => lookup(index)}
                      onkeydown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          lookup(index);
                        }
                      }}
                    />
                    <InputGroup.Addon align="inline-end">
                      <InputGroup.Button
                        size="icon-xs"
                        aria-label="Search SAP items"
                        onclick={() => openSearch(index)}
                      >
                        <SearchIcon />
                      </InputGroup.Button>
                    </InputGroup.Addon>
                  </InputGroup.Root>
                  {#if rowError}
                    <p class="text-destructive mt-1 text-xs">{rowError}</p>
                  {/if}
                </Table.Cell>
                <Table.Cell class="align-top">
                  {#if info}
                    {info.item_description}
                    {#if info.inactive}
                      <Badge variant="destructive">inactive</Badge>
                    {/if}
                  {:else if line.database_id}
                    <span class="text-destructive text-sm">
                      No longer in SAP
                    </span>
                  {/if}
                </Table.Cell>
                <Table.Cell class="align-top">
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    aria-label="Quantity"
                    aria-invalid={$errors.lines?.[index]?.quantity
                      ? true
                      : undefined}
                    bind:value={$form.lines[index].quantity}
                  />
                  {#if $errors.lines?.[index]?.quantity}
                    <p class="text-destructive mt-1 text-xs">
                      {$errors.lines[index].quantity?.[0]}
                    </p>
                  {/if}
                </Table.Cell>
                <Table.Cell class="align-top">
                  {info?.purchasing_uom ?? ""}
                  {#if info && info.stock_uom && info.stock_uom !== info.purchasing_uom}
                    <p
                      class="text-xs text-amber-600"
                      title="SAP cost may be per stock unit, not purchasing unit"
                    >
                      stock unit: {info.stock_uom}
                    </p>
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-right align-top tabular-nums">
                  {#if info?.item_cost != null}
                    {formatEur(info.item_cost)}
                  {:else if info}
                    <Badge variant="destructive">no cost</Badge>
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-right align-top tabular-nums">
                  {#if info?.item_cost != null}
                    {formatEur(Number(line.quantity) * info.item_cost)}
                  {/if}
                </Table.Cell>
                <Table.Cell class="align-top">
                  {#if lineShares.shares[index] > 0}
                    <div class="flex items-center gap-2">
                      <div
                        class="bg-muted h-1.5 w-16 overflow-hidden rounded-full"
                      >
                        <div
                          class="bg-primary h-full"
                          style:width="{lineShares.shares[index]}%"
                        ></div>
                      </div>
                      <span class="text-xs tabular-nums">
                        {formatPercent(lineShares.shares[index])}
                      </span>
                    </div>
                    {#if lineShares.key80.has(index)}
                      <Badge variant="secondary" class="mt-1">key cost</Badge>
                    {/if}
                  {/if}
                </Table.Cell>
                <Table.Cell class="align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line"
                    onclick={() => removeLine(index)}
                  >
                    <Trash2Icon />
                  </Button>
                </Table.Cell>
              </Table.Row>
            {:else}
              <Table.Row>
                <Table.Cell
                  colspan={8}
                  class="text-muted-foreground py-8 text-center"
                >
                  No materials yet. Click Add to start the recipe.
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
          {#if $form.lines.length > 0}
            <Table.Footer>
              <Table.Row>
                <Table.Cell colspan={5} class="text-right font-medium">
                  Total
                </Table.Cell>
                <Table.Cell class="text-right font-semibold tabular-nums">
                  {formatEur(cost.total)}
                </Table.Cell>
                <Table.Cell colspan={2}></Table.Cell>
              </Table.Row>
            </Table.Footer>
          {/if}
        </Table.Root>
        {#if data.recipe?.updated_at}
          <p class="text-muted-foreground mt-3 text-xs">
            Last saved {new Date(data.recipe.updated_at).toLocaleString()}
          </p>
        {/if}
      </Card.Content>
    </Card.Root>
  </form>

  {#if data.menuItem}
    <Card.Root>
      <Card.Header>
        <Card.Title>Item price vs material cost</Card.Title>
        <Card.Description>
          Item price is the menu price incl. VAT; the difference is on the price
          ex VAT (÷ 1.05 ÷ 1.07), since material cost carries no VAT.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <dl class="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <dt class="text-muted-foreground text-sm">Item price</dt>
            <dd class="text-2xl font-semibold tabular-nums">
              {formatEur(menuPrice, 2)}
            </dd>
            <dd class="text-muted-foreground text-xs tabular-nums">
              {formatEur(exVatPrice(menuPrice), 2)} ex VAT
            </dd>
          </div>
          <div>
            <dt class="text-muted-foreground text-sm">Material cost</dt>
            <dd class="text-2xl font-semibold tabular-nums">
              {formatEur(cost.total)}
            </dd>
            {#if cost.total > 0}
              <dd class="text-muted-foreground text-xs tabular-nums">
                {#if latestCost.missing > 0}
                  last purchase price missing on {latestCost.missing} line(s)
                {:else}
                  {formatEur(latestCost.total)} at last purchase price
                  {#if latestChange !== null}
                    <span
                      class={latestChange > 0
                        ? "text-destructive"
                        : "text-emerald-600"}
                    >
                      ({latestChange >= 0 ? "+" : "−"}{formatPercent(
                        Math.abs(latestChange),
                      )})
                    </span>
                  {/if}
                {/if}
              </dd>
            {/if}
            {#if cost.missing > 0}
              <dd class="text-destructive text-xs">
                incomplete: {cost.missing} line(s) without cost
              </dd>
            {/if}
          </div>
          <div>
            <dt class="text-muted-foreground text-sm">Difference</dt>
            <dd
              class={[
                "text-2xl font-semibold tabular-nums",
                priceDifference < 0 && "text-destructive",
              ]}
            >
              {signedEur(priceDifference, 4)}
            </dd>
            <dd class="text-muted-foreground text-xs tabular-nums">
              {#if currentMargin !== null}
                {formatPercent(currentMargin)} margin ·
              {/if}
              {signedEur(menuPrice - cost.total, 4)} before removing VAT
            </dd>
          </div>
          <div>
            <dt class="text-muted-foreground text-sm">Food cost %</dt>
            <dd
              class={[
                "text-2xl font-semibold tabular-nums",
                foodCost !== null &&
                  targetFoodCost !== null &&
                  foodCost > targetFoodCost &&
                  "text-destructive",
              ]}
            >
              {foodCost === null ? "—" : formatPercent(foodCost)}
            </dd>
            <dd class="text-muted-foreground text-xs">
              {#if targetFoodCost !== null}
                target {formatPercent(targetFoodCost)} ·
              {/if}
              cost ÷ price ex VAT
            </dd>
          </div>
        </dl>
      </Card.Content>
    </Card.Root>
  {/if}

  <Card.Root>
    <Card.Header>
      <Card.Title>Ideal price</Card.Title>
      <Card.Description>
        Margin on the price ex VAT. Ideal price = cost ÷ (1 − margin) × 1.05 ×
        1.07, the same rule as the offers data-quality form.
      </Card.Description>
    </Card.Header>
    <Card.Content class="grid gap-6 sm:grid-cols-[14rem_1fr]">
      <div class="space-y-1">
        <Label for="target-margin">Target margin %</Label>
        <Input
          id="target-margin"
          type="number"
          step="0.1"
          min="0"
          max="99.9"
          bind:value={marginPercent}
          aria-invalid={marginPercent !== null && !marginValid
            ? true
            : undefined}
        />
        {#if data.brand.ideal_fc_perc !== null}
          <p class="text-muted-foreground text-xs">
            Brand target: {formatPercent((1 - data.brand.ideal_fc_perc) * 100)}
            margin ({formatPercent(data.brand.ideal_fc_perc * 100)} food cost)
          </p>
        {/if}
      </div>

      {#if cost.total <= 0}
        <p class="text-muted-foreground self-center text-sm">
          Add materials with a SAP cost to calculate an ideal price.
        </p>
      {:else if !marginValid}
        <p class="text-muted-foreground self-center text-sm">
          Enter a margin from 0 to 99.9%.
        </p>
      {:else if idealPrice !== null}
        <dl class="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt class="text-muted-foreground text-sm">Ideal price</dt>
            <dd class="text-2xl font-semibold tabular-nums">
              {formatEur(idealPrice, 2)}
            </dd>
            <dd class="text-muted-foreground text-xs tabular-nums">
              {formatEur(exVatPrice(idealPrice), 2)} ex VAT
            </dd>
          </div>
          <div>
            <dt class="text-muted-foreground flex items-center gap-2 text-sm">
              <label for="price-point">Round up to</label>
              <NativeSelect.Root
                id="price-point"
                size="sm"
                bind:value={pricePoint}
              >
                {#each PRICE_POINT_ENDINGS as ending (ending)}
                  <NativeSelect.Option value={ending}>
                    {ending === "none" ? "no rounding" : `x${ending}`}
                  </NativeSelect.Option>
                {/each}
              </NativeSelect.Root>
            </dt>
            {#if roundedPrice !== null}
              <dd class="text-2xl font-semibold tabular-nums">
                {formatEur(roundedPrice, 2)}
              </dd>
              <dd class="text-muted-foreground text-xs tabular-nums">
                {formatPercent(marginOfPrice(cost.total, roundedPrice) ?? 0)}
                margin · {formatPercent(
                  foodCostPercent(cost.total, roundedPrice) ?? 0,
                )} food cost
              </dd>
            {/if}
          </div>
          {#if data.menuItem && currentMargin !== null}
            <div>
              <dt class="text-muted-foreground text-sm">Item price vs ideal</dt>
              <dd
                class={[
                  "text-2xl font-semibold tabular-nums",
                  menuPrice < idealPrice && "text-destructive",
                ]}
              >
                {signedEur(menuPrice - idealPrice)}
              </dd>
              <dd class="text-muted-foreground text-xs">
                item price {formatEur(menuPrice, 2)}
              </dd>
            </div>
          {/if}
        </dl>
      {/if}

      {#if cost.missing > 0 && cost.total > 0}
        <p class="text-destructive text-sm sm:col-span-2">
          {cost.missing} material(s) have no SAP cost, so this ideal price is too
          low.
        </p>
      {/if}
    </Card.Content>
  </Card.Root>
</main>

<SapItemSearchDialog
  bind:open={dialogOpen}
  brand={data.brand.alias}
  companies={data.companies}
  lockedCompany={data.lockedCompany}
  initialItemNumber={dialogInitial}
  onSelect={(item) => applyItem(dialogRow, item)}
/>
