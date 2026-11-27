<script lang="ts">
  import { tick, untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { superForm } from "sveltekit-superforms/client";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Command from "$lib/components/ui/command/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import {
    impliedDiscount,
    MENU_SIZES,
    menuItemCost,
    netSellingPrice,
    sapKey,
    type MaterialInfo,
    type MenuSize,
  } from "$lib/services/menu";
  import { calculateIdealPrice } from "$lib/services/offers-data-quality";
  import {
    foodCostPercent,
    formatEur,
    marginOfPrice,
    PRICE_POINT_ENDINGS,
    roundUpToPricePoint,
    type PricePointEnding,
    type SapItem,
  } from "$lib/services/recipes";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const { form, errors, enhance, submitting, tainted } = superForm(
    untrack(() => data.form),
    {
      dataType: "json",
      resetForm: false,
      invalidateAll: true,
      onUpdated: ({ form: result }) => {
        if (result.message) toast.success(String(result.message));
        else if (!result.valid) toast.error("Fix the highlighted fields");
      },
    },
  );

  const byId = $derived(
    new Map(data.recipes.map((recipe) => [recipe.id, recipe])),
  );
  // SAP rows of the material lines (stored ones + those picked in the search).
  let materials = $state<Record<string, MaterialInfo>>(
    untrack(() => ({ ...data.materials })),
  );
  const keyOf = (line: {
    database_id: string | null;
    item_number: string | null;
  }) =>
    sapKey({
      database_id: line.database_id ?? "",
      item_number: line.item_number ?? "",
    });

  const totals = $derived(
    menuItemCost(
      $form.lines.map((line) => ({
        ...line,
        quantity: Number(line.quantity) || 0,
      })),
      byId,
      new Map(Object.entries(materials)),
    ),
  );
  const price = $derived(
    $form.price === null || $form.price === undefined || !($form.price > 0)
      ? null
      : Number($form.price),
  );
  const net = $derived(netSellingPrice(price));
  const target = $derived(data.brand.ideal_fc_perc);
  const foodCost = $derived(
    price === null ? null : foodCostPercent(totals.cost, price),
  );
  const margin = $derived(
    price === null ? null : marginOfPrice(totals.cost, price),
  );
  const discount = $derived(impliedDiscount(price, totals.partsPrice));
  const idealPrice = $derived(calculateIdealPrice(totals.cost, target));
  let pricePoint = $state<PricePointEnding>(".50");
  const roundedIdeal = $derived(
    idealPrice === null ? null : roundUpToPricePoint(idealPrice, pricePoint),
  );

  // --- Search: recipes filtered here, SAP materials fetched as you type ---
  let query = $state("");
  const recipeMatches = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data.recipes;
    return data.recipes.filter(
      (recipe) =>
        recipe.name.toLowerCase().includes(needle) ||
        recipe.item_code.toLowerCase().includes(needle) ||
        recipe.category.toLowerCase().includes(needle),
    );
  });
  let materialMatches = $state<SapItem[]>([]);
  let searching = $state(false);
  let searchError = $state("");

  $effect(() => {
    const q = query.trim();
    materialMatches = [];
    searchError = "";
    if (q.length < 2) {
      searching = false;
      return;
    }
    searching = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ brand: data.brand.alias, q });
        const response = await fetch(`/api/sap-items?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(
            response.status === 401
              ? "your session expired, sign in again"
              : `HTTP ${response.status}${body?.message ? `: ${body.message}` : ""}`,
          );
        }
        materialMatches = ((await response.json()) as { items: SapItem[] })
          .items;
      } catch (cause) {
        if (controller.signal.aborted) return;
        const reason = cause instanceof Error ? cause.message : String(cause);
        searchError = `SAP material search failed (${reason})`;
        console.error("[menu builder] SAP material search failed", cause);
      } finally {
        if (!controller.signal.aborted) searching = false;
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });

  function addRecipe(recipeId: number) {
    const index = $form.lines.findIndex((line) => line.recipeId === recipeId);
    if (index >= 0) $form.lines[index].quantity += 1;
    else
      $form.lines = [
        ...$form.lines,
        { recipeId, database_id: null, item_number: null, quantity: 1 },
      ];
  }

  // A material's quantity is a fraction of its purchasing unit (a slice of a
  // 2 kg bag), so picking one focuses its quantity instead of adding units.
  async function addMaterial(item: SapItem) {
    const key = sapKey(item);
    materials[key] = item;
    if (!$form.lines.some((line) => keyOf(line) === key))
      $form.lines = [
        ...$form.lines,
        {
          recipeId: null,
          database_id: item.database_id,
          item_number: item.item_number,
          quantity: 1,
        },
      ];
    await tick();
    const input = document.getElementById(`qty-${key}`);
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  }

  function remove(index: number) {
    $form.lines = $form.lines.filter((_, i) => i !== index);
  }

  const title = $derived(
    $form.name || (data.id ? "Menu item" : "New menu item"),
  );
  const backHref = $derived(
    `/admin/recipes/menu?brand=${encodeURIComponent(data.brand.alias)}`,
  );
  const percent = (value: number | null) =>
    value === null ? "—" : `${value.toFixed(1)}%`;
</script>

<svelte:head>
  <title>{title} | Menu</title>
</svelte:head>

<main
  class="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8"
>
  <div class="flex flex-wrap items-start gap-4">
    <Button
      variant="ghost"
      size="icon"
      href={backHref}
      aria-label="Back to menu"
    >
      <ArrowLeftIcon />
    </Button>
    <div class="mr-auto space-y-1">
      <p class="text-muted-foreground text-sm">{data.brand.name} · Menu</p>
      <h1 class="text-3xl font-semibold tracking-tight">{title}</h1>
    </div>
  </div>

  {#if data.deletedLines.length > 0}
    <p
      class="text-destructive rounded-md border border-current/30 p-3 text-sm"
      role="alert"
    >
      Recipe{data.deletedLines.length === 1 ? "" : "s"} deleted since the last save:
      {data.deletedLines.join(", ")}. The cost leaves
      {data.deletedLines.length === 1 ? "it" : "them"} out; saving removes
      {data.deletedLines.length === 1 ? "it" : "them"} from this menu item.
    </p>
  {/if}

  <form method="POST" action="?/save" use:enhance>
    <div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card.Root class="min-w-0">
        <Card.Header>
          <Card.Title>Add recipes or materials</Card.Title>
          <Card.Description>
            Search a recipe, a POS code, or a SAP material (number or name).
            Click a recipe to add it (again for one more); click a material to
            add it and type its quantity.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <Command.Root class="rounded-md border" shouldFilter={false}>
            <Command.Input
              placeholder="e.g. Zinger, KFC1600…, 27730, cheese"
              bind:value={query}
            />
            <Command.List class="max-h-[60vh]">
              {#if recipeMatches.length > 0}
                <Command.Group heading="Recipes">
                  {#each recipeMatches as recipe (recipe.id)}
                    <Command.Item
                      value={`r${recipe.id}`}
                      onSelect={() => addRecipe(recipe.id)}
                      class="flex items-baseline gap-2"
                    >
                      <Badge variant="secondary" class="shrink-0">Recipe</Badge>
                      <span class="mr-auto truncate">{recipe.name}</span>
                      <span class="text-muted-foreground text-xs tabular-nums">
                        {formatEur(recipe.cost, 2)}{recipe.missing > 0
                          ? "*"
                          : ""}
                        {#if recipe.price !== null}
                          · {formatEur(recipe.price, 2)}
                        {/if}
                      </span>
                    </Command.Item>
                  {/each}
                </Command.Group>
              {/if}
              {#if query.trim().length >= 2}
                <Command.Group heading="SAP materials">
                  {#if searching}
                    <p
                      class="text-muted-foreground flex items-center gap-2 px-2 py-2 text-sm"
                      role="status"
                    >
                      <LoaderCircleIcon class="size-4 animate-spin" /> Searching SAP…
                    </p>
                  {:else if searchError}
                    <p class="text-destructive px-2 py-2 text-sm" role="alert">
                      {searchError}
                    </p>
                  {:else if materialMatches.length === 0}
                    <p class="text-muted-foreground px-2 py-2 text-sm">
                      No SAP material matches.
                    </p>
                  {/if}
                  {#each materialMatches as item (sapKey(item))}
                    <Command.Item
                      value={`m${sapKey(item)}`}
                      onSelect={() => addMaterial(item)}
                      class="flex items-baseline gap-2"
                    >
                      <Badge variant="outline" class="shrink-0">Material</Badge>
                      <span class="font-mono text-xs">{item.item_number}</span>
                      <span class="mr-auto truncate">
                        {item.item_description}
                      </span>
                      <span class="text-muted-foreground text-xs tabular-nums">
                        {item.item_cost === null
                          ? "no cost"
                          : `${formatEur(item.item_cost, 4)} / ${item.purchasing_uom || "unit"}`}
                      </span>
                    </Command.Item>
                  {/each}
                </Command.Group>
              {:else if recipeMatches.length === 0}
                <p class="text-muted-foreground px-2 py-6 text-center text-sm">
                  No recipe matches.
                </p>
              {/if}
            </Command.List>
          </Command.Root>
          <p class="text-muted-foreground mt-2 text-xs">
            Recipes: cost · POS price (* = materials without a SAP cost).
            Materials: SAP cost per purchasing unit; their quantity is in that
            unit.
          </p>
        </Card.Content>
      </Card.Root>

      <div class="flex min-w-0 flex-col gap-6">
        <Card.Root>
          <Card.Header class="flex flex-row items-center gap-3">
            <Card.Title class="mr-auto">Menu item</Card.Title>
            <Button type="submit" disabled={$submitting || !$tainted}>
              {$submitting ? "Saving…" : "Save"}
            </Button>
          </Card.Header>
          <Card.Content class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1 sm:col-span-2">
              <Label for="name">Name</Label>
              <Input
                id="name"
                bind:value={$form.name}
                aria-invalid={$errors.name ? "true" : undefined}
              />
              {#if $errors.name}
                <p class="text-destructive text-xs">{$errors.name}</p>
              {/if}
            </div>
            <div class="space-y-1">
              <Label for="category">Category</Label>
              <Input id="category" bind:value={$form.category} />
            </div>
            <div class="space-y-1">
              <span class="text-sm leading-none font-medium" id="type-label"
                >Type</span
              >
              <ButtonGroup.Root aria-labelledby="type-label">
                <Button
                  type="button"
                  variant={$form.lto ? "outline" : "default"}
                  aria-pressed={!$form.lto}
                  onclick={() => ($form.lto = false)}>Menu Item</Button
                >
                <Button
                  type="button"
                  variant={$form.lto ? "default" : "outline"}
                  aria-pressed={$form.lto}
                  title="Limited time offer"
                  onclick={() => ($form.lto = true)}>LTO</Button
                >
              </ButtonGroup.Root>
              {#if $form.lto}
                <p class="text-muted-foreground text-xs">Limited time offer</p>
              {/if}
            </div>
            <div class="flex min-h-9 items-center gap-2">
              <Switch id="meal" bind:checked={$form.meal} />
              <Label for="meal">Meal</Label>
            </div>
            {#if $form.meal}
              <div class="space-y-1">
                <Label for="size">Size</Label>
                <NativeSelect.Root
                  id="size"
                  value={$form.size ?? ""}
                  onchange={(event) =>
                    ($form.size =
                      (event.currentTarget.value as MenuSize) || null)}
                  aria-invalid={$errors.size ? "true" : undefined}
                >
                  <NativeSelect.Option value="">Pick a size</NativeSelect.Option
                  >
                  {#each MENU_SIZES as size (size)}
                    <NativeSelect.Option value={size}
                      >{size}</NativeSelect.Option
                    >
                  {/each}
                </NativeSelect.Root>
                {#if $errors.size}
                  <p class="text-destructive text-xs">{$errors.size}</p>
                {/if}
              </div>
            {:else}
              <div class="hidden sm:block"></div>
            {/if}
            <div class="space-y-1">
              <Label for="price">Price (VAT incl.)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                bind:value={$form.price}
                aria-invalid={$errors.price ? "true" : undefined}
              />
            </div>
            <div class="space-y-1">
              <Label for="net">Net selling price</Label>
              <Input
                id="net"
                readonly
                tabindex={-1}
                class="bg-muted tabular-nums"
                value={net === null ? "" : net.toFixed(2)}
                aria-describedby="net-help"
              />
              <p id="net-help" class="text-muted-foreground text-xs">
                Price ÷ 1.05 VAT ÷ 1.07 service
              </p>
            </div>
            <div class="flex items-center gap-2 sm:col-span-2">
              <Switch id="active" bind:checked={$form.active} />
              <Label for="active">Active on the menu</Label>
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Title>Contents</Card.Title>
          </Card.Header>
          <Card.Content class="space-y-2">
            {#if $errors.lines?._errors}
              <p class="text-destructive text-sm" role="alert">
                {$errors.lines._errors.join(" ")}
              </p>
            {/if}
            {#if $form.lines.length === 0}
              <p
                class="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm"
              >
                Nothing yet: pick recipes or materials from the search.
              </p>
            {:else}
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Item</Table.Head>
                    <Table.Head class="w-36">Qty</Table.Head>
                    <Table.Head class="text-right">Cost</Table.Head>
                    <Table.Head class="text-right">POS price</Table.Head>
                    <Table.Head class="w-10"></Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each $form.lines as line, index (`${line.recipeId}|${keyOf(line)}`)}
                    {@const quantity = Number(line.quantity) || 0}
                    {#if line.item_number}
                      {@const material = materials[keyOf(line)]}
                      <Table.Row>
                        <Table.Cell class="whitespace-normal">
                          <Badge variant="outline">Material</Badge>
                          <span class="font-mono text-xs"
                            >{line.item_number}</span
                          >
                          {material?.item_description ?? ""}
                          {#if material?.item_cost == null}
                            <span class="text-destructive block text-xs">
                              No SAP cost
                            </span>
                          {/if}
                        </Table.Cell>
                        <Table.Cell>
                          <div class="flex items-center gap-1">
                            <Input
                              id={`qty-${keyOf(line)}`}
                              type="number"
                              step="any"
                              min="0"
                              class="h-8"
                              aria-label={`Quantity of ${material?.item_description ?? line.item_number} in ${material?.purchasing_uom || "units"}`}
                              bind:value={$form.lines[index].quantity}
                            />
                            <span class="text-muted-foreground text-xs">
                              {material?.purchasing_uom ?? ""}
                            </span>
                          </div>
                        </Table.Cell>
                        <Table.Cell class="text-right tabular-nums">
                          {material?.item_cost == null
                            ? "—"
                            : formatEur(material.item_cost * quantity, 4)}
                        </Table.Cell>
                        <Table.Cell class="text-right">—</Table.Cell>
                        <Table.Cell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${material?.item_description ?? line.item_number}`}
                            onclick={() => remove(index)}
                          >
                            <Trash2Icon class="size-4" />
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    {:else}
                      {@const recipe = byId.get(line.recipeId ?? 0)}
                      <Table.Row>
                        <Table.Cell class="whitespace-normal">
                          <Badge variant="secondary">Recipe</Badge>
                          {recipe?.name ?? `Recipe #${line.recipeId}`}
                          {#if recipe && recipe.missing > 0}
                            <span class="text-destructive block text-xs">
                              {recipe.missing} material(s) without a SAP cost
                            </span>
                          {/if}
                        </Table.Cell>
                        <Table.Cell>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            class="h-8"
                            aria-label={`Quantity of ${recipe?.name ?? "recipe"}`}
                            bind:value={$form.lines[index].quantity}
                          />
                        </Table.Cell>
                        <Table.Cell class="text-right tabular-nums">
                          {recipe ? formatEur(recipe.cost * quantity, 2) : "—"}
                        </Table.Cell>
                        <Table.Cell class="text-right tabular-nums">
                          {recipe?.price == null
                            ? "—"
                            : formatEur(recipe.price * quantity, 2)}
                        </Table.Cell>
                        <Table.Cell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${recipe?.name ?? "recipe"}`}
                            onclick={() => remove(index)}
                          >
                            <Trash2Icon class="size-4" />
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    {/if}
                  {/each}
                </Table.Body>
              </Table.Root>
            {/if}
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header>
            <Card.Title>Pricing</Card.Title>
            <Card.Description>
              Food cost % = cost ÷ price ex VAT (÷ 1.05). Ideal price = cost ÷
              brand food-cost target × 1.05 × 1.07.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt class="text-muted-foreground">Food cost</dt>
                <dd class="text-xl font-semibold tabular-nums">
                  {formatEur(totals.cost, 2)}
                </dd>
                {#if !totals.complete}
                  <dd class="text-destructive text-xs">
                    Incomplete: a line lacks a SAP cost or a recipe was deleted
                  </dd>
                {/if}
              </div>
              <div>
                <dt class="text-muted-foreground">Food cost %</dt>
                <dd
                  class={[
                    "text-xl font-semibold tabular-nums",
                    foodCost !== null &&
                      target !== null &&
                      foodCost > target * 100 &&
                      "text-destructive",
                  ]}
                >
                  {percent(foodCost)}
                </dd>
                {#if target !== null}
                  <dd class="text-muted-foreground text-xs">
                    target {(target * 100).toFixed(1)}%
                  </dd>
                {/if}
              </div>
              <div>
                <dt class="text-muted-foreground">Margin</dt>
                <dd class="text-xl font-semibold tabular-nums">
                  {percent(margin)}
                </dd>
              </div>
              <div>
                <dt class="text-muted-foreground">Price / net</dt>
                <dd class="text-xl font-semibold tabular-nums">
                  {price === null ? "—" : formatEur(price, 2)}
                </dd>
                {#if net !== null}
                  <dd class="text-muted-foreground text-xs tabular-nums">
                    net {formatEur(net, 2)}
                  </dd>
                {/if}
              </div>
              <div>
                <dt class="text-muted-foreground">Recipes sold alone</dt>
                <dd class="text-xl font-semibold tabular-nums">
                  {totals.partsPrice === null
                    ? "—"
                    : formatEur(totals.partsPrice, 2)}
                </dd>
                {#if discount !== null}
                  <dd class="text-muted-foreground text-xs">
                    menu price is {Math.abs(discount * 100).toFixed(1)}%
                    {discount >= 0 ? "cheaper" : "dearer"}
                  </dd>
                {/if}
              </div>
              <div class="col-span-2 sm:col-span-3">
                <dt class="text-muted-foreground">Ideal price</dt>
                {#if target === null}
                  <dd class="text-muted-foreground text-xs">
                    Set the brand's food-cost target to get an ideal price.
                  </dd>
                {:else if roundedIdeal === null}
                  <dd>—</dd>
                {:else}
                  <dd class="flex flex-wrap items-center gap-2">
                    <span class="text-xl font-semibold tabular-nums">
                      {formatEur(roundedIdeal, 2)}
                    </span>
                    <NativeSelect.Root
                      bind:value={pricePoint}
                      aria-label="Round up to"
                      class="h-8"
                    >
                      {#each PRICE_POINT_ENDINGS as ending (ending)}
                        <NativeSelect.Option value={ending}>
                          {ending === "none" ? "no rounding" : `ends ${ending}`}
                        </NativeSelect.Option>
                      {/each}
                    </NativeSelect.Root>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onclick={() => ($form.price = roundedIdeal)}
                    >
                      Use as price
                    </Button>
                  </dd>
                {/if}
              </div>
            </dl>
          </Card.Content>
        </Card.Root>
      </div>
    </div>
  </form>
</main>
