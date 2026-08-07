<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { SvelteSet } from "svelte/reactivity";
  import { toast } from "svelte-sonner";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import type { AggregatorStoreAssignmentRow } from "$lib/services/aggregator-kpis/brand-stores.server";
  import { formatBrandLabel, type BrandOption } from "$lib/services/brands";

  let {
    rows,
    brands,
  }: {
    /** Every store on the active platform, with its current brand. */
    rows: AggregatorStoreAssignmentRow[];
    brands: BrandOption[];
  } = $props();

  let search = $state("");
  let unassignedOnly = $state(false);
  let targetBrandId = $state("");
  let busy = $state(false);

  // Keyed on storeId: unique within a platform and stable for the page's life.
  const selected = new SvelteSet<number>();

  // Filtering is client-side: the loader already has every store for the
  // platform, and the list is short enough that a derived filter beats a
  // round-trip. Swap for a debounced endpoint if a platform ever grows large.
  const visibleRows = $derived.by(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (unassignedOnly && row.brandId !== null) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        (row.name ?? "").toLowerCase().includes(term) ||
        row.externalId.toLowerCase().includes(term) ||
        (row.brandName ?? "").toLowerCase().includes(term)
      );
    });
  });

  const allSelected = $derived(
    visibleRows.length > 0 &&
      visibleRows.every((row) => selected.has(row.storeId)),
  );
  const partiallySelected = $derived(
    !allSelected && visibleRows.some((row) => selected.has(row.storeId)),
  );

  const assignedCount = $derived(
    rows.filter((row) => row.brandId !== null).length,
  );

  // Only selected rows that actually have an assignment can be removed.
  const removableCount = $derived(
    rows.filter((row) => selected.has(row.storeId) && row.assignmentId !== null)
      .length,
  );

  function toggleRow(storeId: number) {
    if (selected.has(storeId)) {
      selected.delete(storeId);
    } else {
      selected.add(storeId);
    }
  }

  function toggleAll() {
    if (allSelected) {
      for (const row of visibleRows) {
        selected.delete(row.storeId);
      }
    } else {
      for (const row of visibleRows) {
        selected.add(row.storeId);
      }
    }
  }

  async function send(url: string, method: string, body: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Request failed: ${res.status}`);
    }

    return (await res.json()) as { count: number };
  }

  async function assignSelected() {
    const brandId = Number(targetBrandId);

    if (busy || selected.size === 0 || !brandId) {
      return;
    }

    const entityIds = rows
      .filter((row) => selected.has(row.storeId))
      .map((row) => row.entityId);

    busy = true;
    try {
      const data = await send("/api/admin/brand-entities", "POST", {
        brandId,
        entityType: "aggregatorStore",
        entityIds,
      });
      toast.success(
        `${data.count} ${data.count === 1 ? "store" : "stores"} assigned.`,
      );
      selected.clear();
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }

  async function removeSelected() {
    // Delete by assignment id, not by store: if someone else moved this store
    // to another brand since the page loaded, the stale id simply no longer
    // exists and the delete no-ops instead of clobbering their change.
    const ids = rows
      .filter((row) => selected.has(row.storeId) && row.assignmentId !== null)
      .map((row) => row.assignmentId as string);

    if (busy || ids.length === 0) {
      return;
    }

    busy = true;
    try {
      const data = await send("/api/admin/brand-entities", "DELETE", { ids });
      toast.success(
        `${data.count} ${data.count === 1 ? "store" : "stores"} unassigned.`,
      );
      selected.clear();
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      busy = false;
    }
  }
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div class="w-full max-w-sm space-y-2">
      <label class="text-sm font-medium" for="store-search">Search</label>
      <Input
        id="store-search"
        type="text"
        placeholder="Store name, external id, or brand…"
        bind:value={search}
      />
    </div>

    <div class="flex items-center gap-2 pb-2">
      <Switch id="unassigned-only" bind:checked={unassignedOnly} />
      <label class="text-sm font-medium" for="unassigned-only">
        Unassigned only
      </label>
    </div>

    <p class="text-muted-foreground pb-2 text-sm">
      {assignedCount} of {rows.length} stores assigned
    </p>
  </div>

  <div class="max-h-[32rem] overflow-y-auto rounded-md border">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head class="w-12">
            <button
              type="button"
              class="inline-flex disabled:cursor-not-allowed"
              disabled={visibleRows.length === 0}
              onclick={toggleAll}
              aria-label="Select all"
            >
              <Checkbox
                checked={allSelected}
                indeterminate={partiallySelected}
                class="pointer-events-none"
              />
            </button>
          </Table.Head>
          <Table.Head>Store</Table.Head>
          <Table.Head>External id</Table.Head>
          <Table.Head class="text-right">Brand</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#if visibleRows.length === 0}
          <Table.Row>
            <Table.Cell
              colspan={4}
              class="text-muted-foreground py-10 text-center text-sm"
            >
              {rows.length === 0
                ? "No stores scraped for this platform yet."
                : "No stores match the current filters."}
            </Table.Cell>
          </Table.Row>
        {:else}
          {#each visibleRows as row (row.storeId)}
            <Table.Row>
              <Table.Cell>
                <button
                  type="button"
                  class="inline-flex"
                  onclick={() => toggleRow(row.storeId)}
                  aria-label={`Select ${row.name ?? row.externalId}`}
                >
                  <Checkbox
                    checked={selected.has(row.storeId)}
                    class="pointer-events-none"
                  />
                </button>
              </Table.Cell>
              <Table.Cell class="font-medium">
                {row.name ?? `Store #${row.storeId}`}
              </Table.Cell>
              <Table.Cell class="text-muted-foreground font-mono text-xs">
                {row.externalId}
              </Table.Cell>
              <Table.Cell class="text-right">
                {#if row.brandName}
                  <Badge variant="secondary">{row.brandName}</Badge>
                {:else}
                  <span class="text-muted-foreground text-sm">— unassigned</span
                  >
                {/if}
              </Table.Cell>
            </Table.Row>
          {/each}
        {/if}
      </Table.Body>
    </Table.Root>
  </div>

  <div class="flex flex-wrap items-center justify-between gap-3">
    <span class="text-muted-foreground text-sm">{selected.size} selected</span>

    <div class="flex flex-wrap items-center gap-2">
      <NativeSelect.Root
        bind:value={targetBrandId}
        aria-label="Brand to assign to"
      >
        <NativeSelect.Option value="">Select a brand…</NativeSelect.Option>
        {#each brands as brand (brand.id)}
          <NativeSelect.Option value={brand.id.toString()}>
            {formatBrandLabel(brand)}
          </NativeSelect.Option>
        {/each}
      </NativeSelect.Root>

      <Button
        type="button"
        disabled={busy || selected.size === 0 || targetBrandId === ""}
        onclick={assignSelected}
      >
        {busy ? "Working…" : `Assign ${selected.size}`}
      </Button>

      <Button
        type="button"
        variant="outline"
        disabled={busy || removableCount === 0}
        onclick={removeSelected}
      >
        Remove {removableCount}
      </Button>
    </div>
  </div>
</div>
