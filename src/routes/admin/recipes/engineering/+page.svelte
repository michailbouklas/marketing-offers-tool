<script lang="ts">
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import LabourToggle from "$lib/components/recipes/labour-toggle.svelte";
  import {
    formatEur,
    labourCost,
    menuEngineering,
    primeCostPercent,
    type MenuClass,
  } from "$lib/services/recipes";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let category = $state("");

  const CLASSES: Record<
    MenuClass,
    {
      label: string;
      action: string;
      variant: "default" | "secondary" | "outline" | "destructive";
    }
  > = {
    star: {
      label: "Star",
      action: "Popular and profitable: keep, protect quality and placement.",
      variant: "default",
    },
    plowhorse: {
      label: "Plowhorse",
      action:
        "Popular, low margin: raise the price carefully or cut recipe cost.",
      variant: "secondary",
    },
    puzzle: {
      label: "Puzzle",
      action: "Profitable, rarely ordered: promote, reposition or rename.",
      variant: "outline",
    },
    dog: {
      label: "Dog",
      action: "Unpopular, low margin: remove or rework.",
      variant: "destructive",
    },
    popular: {
      label: "Popular, no cost",
      action: "Sells well but has no complete recipe: build it to rate margin.",
      variant: "outline",
    },
    unpopular: {
      label: "Unpopular, no cost",
      action:
        "Sells little and has no complete recipe: build it to rate margin.",
      variant: "outline",
    },
  };
  const ORDER: MenuClass[] = [
    "star",
    "plowhorse",
    "puzzle",
    "dog",
    "popular",
    "unpopular",
  ];

  const categories = $derived([
    ...new Set(data.items.map((item) => item.category)),
  ]);

  // With labour on, CM is after labour (ex-VAT price × brand labour %) and
  // FC % becomes prime cost %, so classes can shift toward cheaper items.
  let includeLabour = $state(false);
  const labourFraction = $derived(
    includeLabour ? (data.brand.labour_perc ?? 0) : 0,
  );

  // Classified within the visible set: compare like with like (per category).
  const analysis = $derived.by(() => {
    const rows = data.items
      .filter((item) => !category || item.category === category)
      .map((item) => ({
        ...item,
        cm:
          item.cm === null
            ? null
            : item.cm - labourCost(item.price, labourFraction),
      }));
    const { classes, popularityThreshold, averageCm } = menuEngineering(rows);
    const totalUnits = rows.reduce((sum, row) => sum + row.units, 0);
    const classified = rows
      .map((row, index) => ({
        ...row,
        menuClass: classes[index],
        mix: totalUnits > 0 ? (row.units / totalUnits) * 100 : 0,
        totalCm: row.cm === null ? null : row.units * row.cm,
        foodCost:
          row.cost === null
            ? null
            : primeCostPercent(row.cost, row.price, labourFraction),
      }))
      .sort(
        (a, b) =>
          ORDER.indexOf(a.menuClass) - ORDER.indexOf(b.menuClass) ||
          (b.totalCm ?? b.units) - (a.totalCm ?? a.units),
      );
    const counts = Object.fromEntries(
      ORDER.map((key) => [
        key,
        classified.filter((row) => row.menuClass === key).length,
      ]),
    ) as Record<MenuClass, number>;
    return { classified, counts, popularityThreshold, averageCm, totalUnits };
  });

  const query = (params: { brand?: string; days?: number }) =>
    `/admin/recipes/engineering?brand=${encodeURIComponent(params.brand ?? data.brand.alias)}&days=${params.days ?? data.days}`;

  const itemHref = (itemCode: string) =>
    `/admin/recipes/${encodeURIComponent(data.brand.alias)}/${encodeURIComponent(itemCode)}`;
</script>

<svelte:head>
  <title>Menu engineering | Recipes</title>
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
  <div class="flex items-start gap-4">
    <Button
      variant="ghost"
      size="icon"
      href={`/admin/recipes?brand=${encodeURIComponent(data.brand.alias)}`}
      aria-label="Back to menu"
    >
      <ArrowLeftIcon />
    </Button>
    <div class="space-y-1">
      <h1 class="text-3xl font-semibold tracking-tight">Menu engineering</h1>
      <p class="text-muted-foreground text-sm">
        Kasavana–Smith matrix: popularity (units sold) against contribution
        margin (price ex VAT − material cost). An item is popular when it sells
        at least 70% of the average units per item, and profitable when its
        margin is at least the sales-weighted average.
      </p>
    </div>
  </div>

  <div class="flex flex-wrap items-center gap-3">
    <ButtonGroup.Root class="flex-wrap">
      {#each data.brands as brand (brand.id)}
        <Button
          variant={data.brand.id === brand.id ? "default" : "outline"}
          href={query({ brand: brand.alias })}
        >
          {brand.name}
        </Button>
      {/each}
    </ButtonGroup.Root>
    <ButtonGroup.Root>
      {#each data.periods as period (period)}
        <Button
          variant={data.days === period ? "default" : "outline"}
          href={query({ days: period })}
        >
          {period} days
        </Button>
      {/each}
    </ButtonGroup.Root>
    <NativeSelect.Root bind:value={category} aria-label="Category">
      <NativeSelect.Option value="">All categories</NativeSelect.Option>
      {#each categories as option (option)}
        <NativeSelect.Option value={option}>
          {option || "(none)"}
        </NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
  </div>

  <div class="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
    {#each ORDER as key (key)}
      <Card.Root>
        <Card.Header>
          <Card.Description>{CLASSES[key].label}s</Card.Description>
          <Card.Title class="text-3xl tabular-nums">
            {analysis.counts[key]}
          </Card.Title>
        </Card.Header>
        <Card.Content class="text-muted-foreground text-xs">
          {CLASSES[key].action}
        </Card.Content>
      </Card.Root>
    {/each}
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title>
        {analysis.classified.length} items
        <span class="text-muted-foreground text-sm font-normal">
          · popularity threshold {Math.ceil(analysis.popularityThreshold)} units ·
          average margin {formatEur(analysis.averageCm, 2)}
        </span>
      </Card.Title>
      <Card.Description>
        All active items. Rated on popularity only (no margin, left out of the
        average): {data.unrated.noRecipe} without a recipe,
        {data.unrated.incomplete} with missing costs or no price. Units are items
        ordered as menu items in the last {data.days} days (POS head lines).
      </Card.Description>
      <Card.Action>
        <LabourToggle
          labourPerc={data.brand.labour_perc}
          bind:checked={includeLabour}
        />
      </Card.Action>
    </Card.Header>
    <Card.Content>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Item</Table.Head>
            <Table.Head>Category</Table.Head>
            <Table.Head class="text-right">Units</Table.Head>
            <Table.Head class="text-right">Mix %</Table.Head>
            <Table.Head class="text-right">Price</Table.Head>
            <Table.Head class="text-right">Cost</Table.Head>
            <Table.Head class="text-right">
              {labourFraction ? "Margin after labour" : "Margin / unit"}
            </Table.Head>
            <Table.Head class="text-right">Total margin</Table.Head>
            <Table.Head class="text-right">
              {labourFraction ? "Prime %" : "FC %"}
            </Table.Head>
            <Table.Head>Class</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each analysis.classified as row (row.item_code)}
            <Table.Row>
              <Table.Cell>
                <a href={itemHref(row.item_code)} class="hover:underline">
                  {row.description}
                </a>
                <div class="text-muted-foreground font-mono text-xs">
                  {row.item_code}
                </div>
              </Table.Cell>
              <Table.Cell class="text-muted-foreground"
                >{row.category}</Table.Cell
              >
              <Table.Cell class="text-right tabular-nums">
                {row.units.toLocaleString()}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {row.mix.toFixed(1)}%
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatEur(row.price, 2)}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {row.cost === null ? "—" : formatEur(row.cost)}
              </Table.Cell>
              <Table.Cell
                class={[
                  "text-right tabular-nums",
                  row.cm !== null && row.cm < 0 && "text-destructive",
                ]}
              >
                {row.cm === null ? "—" : formatEur(row.cm, 2)}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {row.totalCm === null ? "—" : formatEur(row.totalCm, 2)}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {row.foodCost === null ? "—" : `${row.foodCost.toFixed(1)}%`}
              </Table.Cell>
              <Table.Cell>
                <Badge
                  variant={CLASSES[row.menuClass].variant}
                  title={CLASSES[row.menuClass].action}
                >
                  {CLASSES[row.menuClass].label}
                </Badge>
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell
                colspan={10}
                class="text-muted-foreground py-8 text-center"
              >
                No active menu items for this brand.
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card.Content>
  </Card.Root>
</main>
