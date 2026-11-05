<script lang="ts">
  import { goto } from "$app/navigation";
  import LabourToggle from "$lib/components/recipes/labour-toggle.svelte";
  import RecipeImportDialog from "$lib/components/recipes/recipe-import-dialog.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { formatEur, primeCostPercent } from "$lib/services/recipes";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let search = $state("");
  let category = $state("");
  let onlyWithRecipe = $state(false);
  let onlyActive = $state(true);

  const categories = $derived([
    ...new Set(data.items.map((item) => item.category)),
  ]);

  let sortByFoodCost = $state(false);
  let importOpen = $state(false);

  // With labour on, FC % becomes prime cost % (food + labour) and so does the target.
  let includeLabour = $state(false);
  const labourFraction = $derived(
    includeLabour ? (data.brand?.labour_perc ?? 0) : 0,
  );

  const targetFoodCost = $derived(
    data.brand?.ideal_fc_perc == null
      ? null
      : (data.brand.ideal_fc_perc + labourFraction) * 100,
  );

  // Only for complete recipes: a partial cost would understate food cost.
  const withFoodCost = $derived(
    data.items.map((item) => ({
      ...item,
      foodCost:
        item.recipe && item.recipe.missing === 0
          ? primeCostPercent(item.recipe.total, item.price, labourFraction)
          : null,
    })),
  );

  const visible = $derived.by(() => {
    const term = search.trim().toLowerCase();
    const rows = withFoodCost.filter(
      (item) =>
        (!category || item.category === category) &&
        (!onlyWithRecipe || item.recipe) &&
        (!onlyActive || item.active) &&
        (!term ||
          item.item_code.toLowerCase().includes(term) ||
          item.description.toLowerCase().includes(term)),
    );
    return sortByFoodCost
      ? rows.toSorted((a, b) => (b.foodCost ?? -1) - (a.foodCost ?? -1))
      : rows;
  });

  const recipeCount = $derived(
    data.items.filter((item) => item.recipe?.source === "recipe").length,
  );

  function itemHref(itemCode: string) {
    return `/admin/recipes/${encodeURIComponent(data.brand?.alias ?? "")}/${encodeURIComponent(itemCode)}`;
  }
</script>

<svelte:head>
  <title>Recipes | Admin</title>
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
  <div class="space-y-1">
    <h1 class="text-3xl font-semibold tracking-tight">Recipes</h1>
    <p class="text-muted-foreground text-sm">
      Build each menu item's recipe from SAP materials to get its material cost.
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

    <Card.Root>
      <Card.Header class="flex flex-row flex-wrap items-center gap-3">
        <Card.Title class="mr-auto">
          {data.brand?.name} menu
          <span class="text-muted-foreground text-sm font-normal">
            {visible.length} of {data.items.length} items · {recipeCount} with a recipe
          </span>
        </Card.Title>
        <Input
          class="w-64"
          placeholder="Search code or description"
          aria-label="Search menu items"
          bind:value={search}
        />
        <NativeSelect.Root bind:value={category} aria-label="Category">
          <NativeSelect.Option value="">All categories</NativeSelect.Option>
          {#each categories as option (option)}
            <NativeSelect.Option value={option}>
              {option || "(none)"}
            </NativeSelect.Option>
          {/each}
        </NativeSelect.Root>
        <Button
          variant={onlyWithRecipe ? "default" : "outline"}
          onclick={() => (onlyWithRecipe = !onlyWithRecipe)}
          aria-pressed={onlyWithRecipe}
        >
          With recipe
        </Button>
        <Button
          variant={onlyActive ? "default" : "outline"}
          onclick={() => (onlyActive = !onlyActive)}
          aria-pressed={onlyActive}
        >
          Active only
        </Button>
        <Button
          variant="outline"
          href={`/admin/recipes/engineering?brand=${encodeURIComponent(data.brand?.alias ?? "")}`}
        >
          Menu engineering
        </Button>
        <Button
          variant="outline"
          href={`/admin/recipes/${encodeURIComponent(data.brand?.alias ?? "")}/combo-items`}
        >
          Combo items
        </Button>
        {#if data.brand}
          <Button variant="outline" onclick={() => (importOpen = true)}>
            Import
          </Button>
          <RecipeImportDialog bind:open={importOpen} brand={data.brand} />
          <LabourToggle
            labourPerc={data.brand.labour_perc}
            bind:checked={includeLabour}
          />
        {/if}
      </Card.Header>
      <Card.Content>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Item code</Table.Head>
              <Table.Head>Description</Table.Head>
              <Table.Head>Category</Table.Head>
              <Table.Head class="text-right">Price</Table.Head>
              <Table.Head>Recipe</Table.Head>
              <Table.Head class="text-right">Material cost</Table.Head>
              <Table.Head class="text-right">
                <button
                  type="button"
                  class="hover:text-foreground inline-flex items-center gap-1"
                  aria-pressed={sortByFoodCost}
                  title="Sort by cost %, highest first"
                  onclick={() => (sortByFoodCost = !sortByFoodCost)}
                >
                  {labourFraction ? "Prime %" : "FC %"}{sortByFoodCost
                    ? " ↓"
                    : ""}
                </button>
              </Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each visible as item (item.item_code)}
              <Table.Row
                class="cursor-pointer"
                onclick={() => goto(itemHref(item.item_code))}
              >
                <Table.Cell class="font-mono text-xs">
                  <a
                    href={itemHref(item.item_code)}
                    class="hover:underline"
                    onclick={(event) => event.stopPropagation()}
                  >
                    {item.item_code}
                  </a>
                </Table.Cell>
                <Table.Cell>
                  {item.description}
                  {#if !item.active}
                    <Badge variant="outline" class="ml-1">inactive</Badge>
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-muted-foreground">
                  {item.category}{item.subcategory
                    ? ` / ${item.subcategory}`
                    : ""}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {formatEur(item.price, 2)}
                </Table.Cell>
                <Table.Cell>
                  {#if item.recipe?.source === "combo"}
                    <Badge
                      variant="outline"
                      title="Cost from the recipes of the components it is sold with"
                    >
                      Combo · {item.recipe.componentCount} components
                    </Badge>
                  {:else if item.recipe}
                    <Badge variant="secondary">
                      {item.recipe.lineCount} materials
                    </Badge>
                  {:else}
                    <span class="text-muted-foreground text-xs">—</span>
                  {/if}
                </Table.Cell>
                <Table.Cell class="text-right tabular-nums">
                  {#if item.recipe}
                    {formatEur(item.recipe.total)}
                    {#if item.recipe.missing > 0}
                      <Badge variant="destructive" class="ml-1">
                        {item.recipe.missing}
                        {item.recipe.source === "combo"
                          ? "without recipe"
                          : "no cost"}
                      </Badge>
                    {/if}
                  {/if}
                </Table.Cell>
                <Table.Cell
                  class={[
                    "text-right tabular-nums",
                    item.foodCost !== null &&
                      targetFoodCost !== null &&
                      item.foodCost > targetFoodCost &&
                      "text-destructive font-medium",
                  ]}
                >
                  {item.foodCost === null ? "" : `${item.foodCost.toFixed(1)}%`}
                </Table.Cell>
              </Table.Row>
            {:else}
              <Table.Row>
                <Table.Cell
                  colspan={7}
                  class="text-muted-foreground py-8 text-center"
                >
                  No menu items match.
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>
  {/if}
</main>
