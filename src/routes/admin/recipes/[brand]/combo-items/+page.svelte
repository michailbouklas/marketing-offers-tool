<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import DateRangeFilter from "$lib/components/date-range-filter.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import LabourToggle from "$lib/components/recipes/labour-toggle.svelte";
  import { formatEur, primeCostPercent } from "$lib/services/recipes";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // With labour on, FC % becomes prime cost % (food + labour).
  let includeLabour = $state(false);
  const labourFraction = $derived(
    includeLabour ? (data.brand.labour_perc ?? 0) : 0,
  );

  let search = $state("");
  let category = $state("");

  const categories = $derived([
    ...new Set(data.combos.map((combo) => combo.category)),
  ]);
  const visible = $derived.by(() => {
    const term = search.trim().toLowerCase();
    return data.combos.filter(
      (combo) =>
        (!category || combo.category === category) &&
        (!term ||
          combo.code.toLowerCase().includes(term) ||
          combo.description.toLowerCase().includes(term)),
    );
  });

  const query = $derived(page.url.search);
  const brandHref = (alias: string) =>
    `/admin/recipes/${encodeURIComponent(alias)}/combo-items${query}`;
  const comboHref = (code: string) =>
    `/admin/recipes/${encodeURIComponent(data.brand.alias)}/combo-items/${encodeURIComponent(code)}${query}`;

  function applyRange(next: { from?: string; to?: string }) {
    const params = new URLSearchParams();
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    const search = params.toString();
    goto(`${page.url.pathname}${search ? `?${search}` : ""}`, {
      noScroll: true,
      keepFocus: true,
    });
  }
</script>

<svelte:head>
  <title>Combo items · {data.brand.name} | Recipes</title>
</svelte:head>

<main class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
  <div class="space-y-1">
    <a
      href={`/admin/recipes?brand=${encodeURIComponent(data.brand.alias)}`}
      class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
    >
      <ArrowLeftIcon class="size-4" /> Recipes
    </a>
    <h1 class="text-3xl font-semibold tracking-tight">Combo items</h1>
    <p class="text-muted-foreground text-sm">
      Items sold with other items attached as their own lines in the POS (meals,
      bundles, offers). Open one to see what goes out with it.
    </p>
  </div>

  <ButtonGroup.Root class="flex-wrap">
    {#each data.brands as brand (brand.id)}
      <Button
        variant={data.brand.id === brand.id ? "default" : "outline"}
        href={brandHref(brand.alias)}
      >
        {brand.name}
      </Button>
    {/each}
  </ButtonGroup.Root>

  <Card.Root>
    <Card.Header class="flex flex-row flex-wrap items-center gap-3">
      <Card.Title class="mr-auto">
        {data.brand.name} combos
        <span class="text-muted-foreground text-sm font-normal">
          {visible.length} of {data.combos.length} · {data.range.from} to {data
            .range.to}
        </span>
      </Card.Title>
      <DateRangeFilter
        from={data.range.from}
        to={data.range.to}
        onApply={applyRange}
      />
      <Input
        class="w-64"
        placeholder="Search code or name"
        aria-label="Search combos"
        bind:value={search}
      />
      <NativeSelect.Root bind:value={category} aria-label="Category">
        <NativeSelect.Option value="">All categories</NativeSelect.Option>
        {#each categories as option (option)}
          <NativeSelect.Option value={option}>
            {option || "(not on the menu)"}
          </NativeSelect.Option>
        {/each}
      </NativeSelect.Root>
      <LabourToggle
        labourPerc={data.brand.labour_perc}
        bind:checked={includeLabour}
      />
    </Card.Header>
    <Card.Content>
      <p class="text-muted-foreground mb-3 text-xs">
        Without a date range the last 90 days are shown.
      </p>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Item code</Table.Head>
            <Table.Head>Name</Table.Head>
            <Table.Head>Category</Table.Head>
            <Table.Head class="text-right">Menu price</Table.Head>
            <Table.Head class="text-right">Sold</Table.Head>
            <Table.Head class="text-right">Net</Table.Head>
            <Table.Head class="text-right">Components</Table.Head>
            <Table.Head class="text-right">Material cost</Table.Head>
            <Table.Head class="text-right">
              {labourFraction ? "Prime %" : "FC %"}
            </Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each visible as combo (combo.code)}
            {@const foodCost =
              combo.cost.missing === 0 && combo.price
                ? primeCostPercent(
                    combo.cost.total,
                    combo.price,
                    labourFraction,
                  )
                : null}
            <Table.Row
              class="cursor-pointer"
              onclick={() => goto(comboHref(combo.code))}
            >
              <Table.Cell class="font-mono text-xs">
                <a
                  href={comboHref(combo.code)}
                  class="hover:underline"
                  onclick={(event) => event.stopPropagation()}
                >
                  {combo.code}
                </a>
              </Table.Cell>
              <Table.Cell>
                {combo.description || combo.code}
                {#if !combo.onMenu}
                  <Badge variant="outline" class="ml-1">not on the menu</Badge>
                {/if}
              </Table.Cell>
              <Table.Cell class="text-muted-foreground">
                {combo.category}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {combo.price === null ? "" : formatEur(combo.price, 2)}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {combo.sold.toLocaleString("en-IE")}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatEur(combo.net, 2)}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {combo.componentItems}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {formatEur(combo.cost.total)}
                {#if combo.cost.missing > 0}
                  <Badge variant="destructive" class="ml-1">
                    {combo.cost.missing} missing
                  </Badge>
                {/if}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {foodCost === null ? "" : `${foodCost.toFixed(1)}%`}
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell
                colspan={9}
                class="text-muted-foreground py-8 text-center"
              >
                No combos sold in this period.
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card.Content>
  </Card.Root>
</main>
