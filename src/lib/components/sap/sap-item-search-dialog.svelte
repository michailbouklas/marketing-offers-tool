<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { formatEur, type SapItem } from "$lib/services/recipes";

  /**
   * Advanced search over SAP `dbo.sapbw_items` (via GET /api/sap-items).
   * `brand` scopes the search server-side; `lockedCompany` (when the brand
   * maps to a warehouse company) is shown read-only, otherwise the user may
   * pick any of `companies`.
   */
  let {
    open = $bindable(false),
    brand,
    companies = [],
    lockedCompany = null,
    initialItemNumber = "",
    onSelect,
  }: {
    open?: boolean;
    brand: string;
    companies?: string[];
    lockedCompany?: string | null;
    initialItemNumber?: string;
    onSelect: (item: SapItem) => void;
  } = $props();

  let filters = $state({
    item_number: "",
    item_description: "",
    companyname: "",
    item_group: "",
    item_sub_category: "",
  });
  let results = $state<SapItem[]>([]);
  let loading = $state(false);
  let errorText = $state("");
  let searched = $state(false);

  $effect(() => {
    if (open) {
      filters.item_number = initialItemNumber;
      results = [];
      searched = false;
      errorText = "";
    }
  });

  async function search(event?: SubmitEvent) {
    event?.preventDefault();
    loading = true;
    errorText = "";
    const params = new URLSearchParams({ brand });
    for (const [key, value] of Object.entries(filters)) {
      if (value.trim()) params.set(key, value.trim());
    }
    try {
      const response = await fetch(`/api/sap-items?${params}`);
      if (!response.ok) throw new Error(`Search failed (${response.status})`);
      results = (await response.json()).items;
      searched = true;
    } catch (error) {
      errorText = error instanceof Error ? error.message : "Search failed";
    } finally {
      loading = false;
    }
  }

  function pick(item: SapItem) {
    onSelect(item);
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-5xl">
    <Dialog.Header>
      <Dialog.Title>Search SAP items</Dialog.Title>
      <Dialog.Description>
        Shows up to 50 active items. Click a row to select it.
      </Dialog.Description>
    </Dialog.Header>

    <form class="grid gap-3 sm:grid-cols-3" onsubmit={search}>
      <div class="space-y-1">
        <Label for="sap-item-number">Item number</Label>
        <Input
          id="sap-item-number"
          placeholder="Starts with…"
          bind:value={filters.item_number}
        />
      </div>
      <div class="space-y-1 sm:col-span-2">
        <Label for="sap-item-description">Description</Label>
        <Input
          id="sap-item-description"
          placeholder="Contains…"
          bind:value={filters.item_description}
        />
      </div>
      <div class="space-y-1">
        <Label for="sap-company">Company</Label>
        {#if lockedCompany}
          <Input id="sap-company" value={lockedCompany} disabled />
        {:else}
          <NativeSelect.Root
            id="sap-company"
            class="w-full"
            bind:value={filters.companyname}
          >
            <NativeSelect.Option value="">All companies</NativeSelect.Option>
            {#each companies as company (company)}
              <NativeSelect.Option value={company}
                >{company}</NativeSelect.Option
              >
            {/each}
          </NativeSelect.Root>
        {/if}
      </div>
      <div class="space-y-1">
        <Label for="sap-item-group">Item group</Label>
        <Input
          id="sap-item-group"
          placeholder="Contains…"
          bind:value={filters.item_group}
        />
      </div>
      <div class="space-y-1">
        <Label for="sap-item-sub-category">Sub-category</Label>
        <Input
          id="sap-item-sub-category"
          placeholder="Contains…"
          bind:value={filters.item_sub_category}
        />
      </div>
      <div class="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </Button>
        {#if errorText}
          <p class="text-destructive text-sm" role="alert">{errorText}</p>
        {/if}
      </div>
    </form>

    <div class="max-h-[50vh] overflow-auto">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Item no.</Table.Head>
            <Table.Head>Description</Table.Head>
            <Table.Head>Group</Table.Head>
            <Table.Head>Company</Table.Head>
            <Table.Head>UoM</Table.Head>
            <Table.Head class="text-right">Cost</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each results as item (`${item.database_id}|${item.item_number}`)}
            <Table.Row
              class="cursor-pointer"
              tabindex={0}
              onclick={() => pick(item)}
              onkeydown={(event) => event.key === "Enter" && pick(item)}
            >
              <Table.Cell class="font-mono text-xs"
                >{item.item_number}</Table.Cell
              >
              <Table.Cell>{item.item_description}</Table.Cell>
              <Table.Cell class="text-muted-foreground text-xs">
                {item.item_group}{item.item_sub_category
                  ? ` / ${item.item_sub_category}`
                  : ""}
              </Table.Cell>
              <Table.Cell class="text-muted-foreground text-xs">
                {item.companyname}
              </Table.Cell>
              <Table.Cell>{item.purchasing_uom}</Table.Cell>
              <Table.Cell class="text-right tabular-nums">
                {#if item.item_cost === null}
                  <Badge variant="destructive">no cost</Badge>
                {:else}
                  {formatEur(item.item_cost)}
                {/if}
              </Table.Cell>
            </Table.Row>
          {:else}
            {#if searched}
              <Table.Row>
                <Table.Cell
                  colspan={6}
                  class="text-muted-foreground py-6 text-center"
                >
                  No items found.
                </Table.Cell>
              </Table.Row>
            {/if}
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  </Dialog.Content>
</Dialog.Root>
