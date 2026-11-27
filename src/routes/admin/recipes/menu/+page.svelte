<script lang="ts">
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { toast } from "svelte-sonner";
  import { superForm } from "sveltekit-superforms/client";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import MenuImportDialog from "$lib/components/recipes/menu-import-dialog.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as ButtonGroup from "$lib/components/ui/button-group/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { impliedDiscount, netSellingPrice } from "$lib/services/menu";
  import { calculateIdealPrice } from "$lib/services/offers-data-quality";
  import { foodCostPercent, formatEur } from "$lib/services/recipes";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const brandQuery = $derived(
    `brand=${encodeURIComponent(data.brand?.alias ?? "")}`,
  );

  let search = $state("");
  let status = $state<"all" | "active" | "disabled">("all");
  let lto = $state<"all" | "lto" | "regular">("all");
  let category = $state("");
  const categories = $derived(
    [...new Set(data.rows.map((row) => row.category).filter(Boolean))].sort(),
  );

  const target = $derived(data.brand?.ideal_fc_perc ?? null);
  const rows = $derived.by(() => {
    const needle = search.trim().toLowerCase();
    return data.rows
      .filter(
        (row) =>
          (status === "all" || row.active === (status === "active")) &&
          (lto === "all" || row.lto === (lto === "lto")) &&
          (!category || row.category === category) &&
          (!needle ||
            row.name.toLowerCase().includes(needle) ||
            row.contents.toLowerCase().includes(needle)),
      )
      .map((row) => {
        const fc =
          row.complete && row.price !== null
            ? foodCostPercent(row.cost, row.price)
            : null;
        return {
          ...row,
          fc,
          over: fc !== null && target !== null && fc > target * 100,
          ideal: row.complete ? calculateIdealPrice(row.cost, target) : null,
          discount: impliedDiscount(row.price, row.parts_price),
          net: netSellingPrice(row.price),
        };
      });
  });

  // Selection survives filtering; actions apply only to the selected ids.
  const selected = new SvelteSet<number>();
  const visibleSelected = $derived(rows.filter((row) => selected.has(row.id)));
  const allVisibleSelected = $derived(
    rows.length > 0 && visibleSelected.length === rows.length,
  );

  function toggleAll(checked: boolean) {
    for (const row of rows) {
      if (checked) selected.add(row.id);
      else selected.delete(row.id);
    }
  }

  let importOpen = $state(false);
  let confirmDelete = $state(false);

  const {
    form: bulk,
    enhance,
    submit,
    submitting,
  } = superForm(
    untrack(() => data.bulkForm),
    {
      dataType: "json",
      invalidateAll: true,
      resetForm: false,
      onUpdated: ({ form: result }) => {
        if (result.message) {
          toast.success(String(result.message));
          selected.clear();
        } else if (!result.valid)
          toast.error("The action could not be applied");
      },
    },
  );

  function run(action: "activate" | "disable" | "delete") {
    $bulk = { action, ids: [...selected] };
    confirmDelete = false;
    submit();
  }

  const percent = (value: number | null) =>
    value === null ? "—" : `${value.toFixed(1)}%`;
</script>

<svelte:head>
  <title>Menu | Recipes</title>
</svelte:head>

<main
  class="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8"
>
  <div class="flex items-start gap-4">
    <Button
      variant="ghost"
      size="icon"
      href={`/admin/recipes?${brandQuery}`}
      aria-label="Back to recipes"
    >
      <ArrowLeftIcon />
    </Button>
    <div class="space-y-1">
      <h1 class="text-3xl font-semibold tracking-tight">Menu</h1>
      <p class="text-muted-foreground text-sm">
        Menu items are priced bundles of recipes: one recipe for a single item,
        several for a combo. Disable limited-time items off-season and activate
        them again when they return.
      </p>
    </div>
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
          href={`/admin/recipes/menu?brand=${encodeURIComponent(brand.alias)}`}
        >
          {brand.name}
        </Button>
      {/each}
    </ButtonGroup.Root>
  {/if}

  {#if data.brand}
    <Card.Root class="min-w-0">
      <Card.Header class="flex flex-row flex-wrap items-center gap-3">
        <Card.Title class="mr-auto">
          {data.brand.name}
          <span class="text-muted-foreground text-sm font-normal">
            {data.rows.filter((row) => row.active).length} active ·
            {data.rows.filter((row) => !row.active).length} disabled
          </span>
        </Card.Title>
        <Button
          variant="outline"
          href={`/admin/recipes/menu/template?${brandQuery}`}
          data-sveltekit-reload
        >
          <DownloadIcon class="size-4" /> Download template
        </Button>
        <Button variant="outline" onclick={() => (importOpen = true)}>
          Import
        </Button>
        <Button
          href={`/admin/recipes/menu/${encodeURIComponent(data.brand.alias)}/new`}
        >
          <PlusIcon class="size-4" /> New menu item
        </Button>
      </Card.Header>
      <Card.Content class="space-y-3">
        <div class="flex flex-wrap items-center gap-3">
          <Input
            class="max-w-xs"
            placeholder="Search name or recipe…"
            aria-label="Search menu items"
            bind:value={search}
          />
          <NativeSelect.Root bind:value={status} aria-label="Status">
            <NativeSelect.Option value="all">All statuses</NativeSelect.Option>
            <NativeSelect.Option value="active">Active</NativeSelect.Option>
            <NativeSelect.Option value="disabled">Disabled</NativeSelect.Option>
          </NativeSelect.Root>
          <NativeSelect.Root bind:value={lto} aria-label="Type">
            <NativeSelect.Option value="all">All types</NativeSelect.Option>
            <NativeSelect.Option value="regular">Menu Item</NativeSelect.Option>
            <NativeSelect.Option value="lto"
              >LTO (limited time offer)</NativeSelect.Option
            >
          </NativeSelect.Root>
          <NativeSelect.Root bind:value={category} aria-label="Category">
            <NativeSelect.Option value="">All categories</NativeSelect.Option>
            {#each categories as name (name)}
              <NativeSelect.Option value={name}>{name}</NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
          <span class="text-muted-foreground text-sm" role="status">
            {rows.length} of {data.rows.length}
          </span>
        </div>

        <form
          method="POST"
          action={`?/bulk&${brandQuery}`}
          use:enhance
          class={[
            "bg-muted sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md p-2 text-sm",
            selected.size === 0 && "hidden",
          ]}
          aria-label="Selected menu items"
        >
          <span class="mr-2 font-medium">{selected.size} selected</span>
          {#if visibleSelected.length !== selected.size}
            <span class="text-muted-foreground text-xs">
              ({selected.size - visibleSelected.length} hidden by the filters)
            </span>
          {/if}
          <Button
            type="button"
            size="sm"
            disabled={$submitting}
            onclick={() => run("activate")}>Make active</Button
          >
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={$submitting}
            onclick={() => run("disable")}>Disable</Button
          >
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={$submitting}
            onclick={() => (confirmDelete = true)}>Delete</Button
          >
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onclick={() => selected.clear()}>Clear selection</Button
          >
        </form>

        {#if data.rows.length === 0}
          <p
            class="text-muted-foreground rounded-md border border-dashed p-6 text-sm"
          >
            {data.brand.name} has no menu items yet. Create one, or download the template,
            fill it in and import it.
          </p>
        {:else}
          <div class="max-h-[70vh] overflow-auto rounded-md border">
            <Table.Root>
              <Table.Header class="bg-background sticky top-0 z-[1]">
                <Table.Row>
                  <Table.Head class="w-8">
                    <Checkbox
                      checked={allVisibleSelected}
                      indeterminate={visibleSelected.length > 0 &&
                        !allVisibleSelected}
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                      aria-label="Select all shown menu items"
                    />
                  </Table.Head>
                  <Table.Head>Menu item</Table.Head>
                  <Table.Head>Category</Table.Head>
                  <Table.Head>Type</Table.Head>
                  <Table.Head>Status</Table.Head>
                  <Table.Head class="text-right">Cost</Table.Head>
                  <Table.Head class="text-right">Price</Table.Head>
                  <Table.Head class="text-right">Net</Table.Head>
                  <Table.Head class="text-right">Food cost</Table.Head>
                  <Table.Head class="text-right">Ideal price</Table.Head>
                  <Table.Head class="text-right">vs parts</Table.Head>
                  <Table.Head>Updated</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each rows as row (row.id)}
                  <Table.Row
                    data-state={selected.has(row.id) ? "selected" : undefined}
                    class={!row.active ? "text-muted-foreground" : ""}
                  >
                    <Table.Cell>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(checked) =>
                          checked === true
                            ? selected.add(row.id)
                            : selected.delete(row.id)}
                        aria-label={`Select ${row.name}`}
                      />
                    </Table.Cell>
                    <Table.Cell class="max-w-sm whitespace-normal">
                      <a
                        class="font-medium hover:underline"
                        href={`/admin/recipes/menu/${encodeURIComponent(data.brand.alias)}/${row.id}`}
                        >{row.name}</a
                      >
                      <p class="text-muted-foreground line-clamp-2 text-xs">
                        {row.contents}
                      </p>
                    </Table.Cell>
                    <Table.Cell>{row.category}</Table.Cell>
                    <Table.Cell>
                      <div class="flex flex-wrap gap-1">
                        {#if row.lto}
                          <Badge variant="secondary" title="Limited time offer"
                            >LTO</Badge
                          >
                        {:else}
                          <Badge variant="outline">Menu Item</Badge>
                        {/if}
                        {#if row.meal}
                          <Badge variant="outline">Meal · {row.size}</Badge>
                        {/if}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge variant={row.active ? "default" : "outline"}>
                        {row.active ? "Active" : "Disabled"}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {formatEur(row.cost, 2)}
                      {#if !row.complete}
                        <span
                          class="text-destructive block text-xs"
                          title="A recipe is missing or has materials without a SAP cost"
                          >incomplete</span
                        >
                      {/if}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {row.price === null ? "—" : formatEur(row.price, 2)}
                    </Table.Cell>
                    <Table.Cell
                      class="text-muted-foreground text-right tabular-nums"
                    >
                      {row.net === null ? "—" : formatEur(row.net, 2)}
                    </Table.Cell>
                    <Table.Cell
                      class={[
                        "text-right tabular-nums",
                        row.over && "text-destructive font-medium",
                      ]}
                    >
                      {percent(row.fc)}
                    </Table.Cell>
                    <Table.Cell class="text-right tabular-nums">
                      {row.ideal === null ? "—" : formatEur(row.ideal, 2)}
                    </Table.Cell>
                    <Table.Cell
                      class="text-right tabular-nums"
                      title="Price vs the parts sold alone at their POS price"
                    >
                      {row.discount === null
                        ? "—"
                        : `${row.discount > 0 ? "−" : "+"}${Math.abs(row.discount * 100).toFixed(0)}%`}
                    </Table.Cell>
                    <Table.Cell class="text-xs tabular-nums">
                      {row.updated}
                    </Table.Cell>
                  </Table.Row>
                {:else}
                  <Table.Row>
                    <Table.Cell
                      colspan={12}
                      class="text-muted-foreground py-6 text-center"
                    >
                      No menu items match the filters.
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          </div>
        {/if}
        {#if target === null}
          <p class="text-muted-foreground text-xs">
            Set the brand's food-cost target to see ideal prices and the
            over-target highlight.
          </p>
        {/if}
      </Card.Content>
    </Card.Root>

    <MenuImportDialog bind:open={importOpen} brand={data.brand} />

    <AlertDialog.Root bind:open={confirmDelete}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>
            Delete {selected.size} menu item{selected.size === 1 ? "" : "s"}?
          </AlertDialog.Title>
          <AlertDialog.Description>
            This cannot be undone. To take a limited-time item off the menu
            until it returns, disable it instead.
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
          <AlertDialog.Action onclick={() => run("delete")}>
            Delete
          </AlertDialog.Action>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>
  {/if}
</main>
