<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import { toast } from "svelte-sonner";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import type {
    BrandEntityType,
    EntityCandidateRow,
  } from "$lib/services/brand-entities";

  type Props = {
    brandId: number;
    entityType: BrandEntityType;
    open: boolean;
    onAssigned?: () => void;
  };

  let { brandId, entityType, open = $bindable(), onAssigned }: Props = $props();

  const config: Record<
    BrandEntityType,
    { title: string; placeholder: string; subLabelHeader: string }
  > = {
    competitionRestaurant: {
      title: "Assign competition restaurants",
      placeholder: "Search restaurants by name… (e.g. kfc)",
      subLabelHeader: "Aggregator",
    },
    googleReviewsBusiness: {
      title: "Assign Google reviews businesses",
      placeholder: "Search businesses by name… (e.g. kfc)",
      subLabelHeader: "Category",
    },
  };

  const view = $derived(config[entityType]);

  let query = $state("");
  let results = $state<EntityCandidateRow[]>([]);
  let loading = $state(false);
  let assigning = $state(false);
  const selected = new SvelteSet<string>();

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  // Monotonic token so a slow earlier response can't overwrite a newer one.
  let requestSeq = 0;

  function isOnThisBrand(row: EntityCandidateRow): boolean {
    return row.assignedBrandId === brandId;
  }

  // Rows the user can still act on (those not already on this brand).
  const selectableRows = $derived(results.filter((row) => !isOnThisBrand(row)));
  const allSelected = $derived(
    selectableRows.length > 0 &&
      selectableRows.every((row) => selected.has(row.entityId)),
  );
  const partiallySelected = $derived(
    !allSelected && selectableRows.some((row) => selected.has(row.entityId)),
  );

  function resetState() {
    query = "";
    results = [];
    loading = false;
    selected.clear();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  // Reset whenever the dialog is (re)opened.
  $effect(() => {
    if (open) {
      resetState();
    }
  });

  async function runSearch(term: string) {
    const trimmed = term.trim();
    if (!trimmed) {
      results = [];
      loading = false;
      return;
    }

    const seq = ++requestSeq;
    loading = true;
    try {
      const url = `/api/admin/brand-entities/search?entityType=${entityType}&q=${encodeURIComponent(trimmed)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Search failed: ${res.status}`);
      }
      const data = (await res.json()) as { items: EntityCandidateRow[] };
      if (seq === requestSeq) {
        results = data.items;
      }
    } catch (err) {
      if (seq === requestSeq) {
        results = [];
        toast.error(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (seq === requestSeq) {
        loading = false;
      }
    }
  }

  function handleSearchInput() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runSearch(query);
    }, 400);
  }

  function toggleRow(row: EntityCandidateRow) {
    if (isOnThisBrand(row)) {
      return;
    }
    if (selected.has(row.entityId)) {
      selected.delete(row.entityId);
    } else {
      selected.add(row.entityId);
    }
  }

  function toggleAll() {
    if (allSelected) {
      for (const row of selectableRows) {
        selected.delete(row.entityId);
      }
    } else {
      for (const row of selectableRows) {
        selected.add(row.entityId);
      }
    }
  }

  async function assignSelected() {
    if (assigning || selected.size === 0) {
      return;
    }
    assigning = true;
    try {
      const res = await fetch("/api/admin/brand-entities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brandId,
          entityType,
          entityIds: [...selected],
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Assign failed: ${res.status}`);
      }
      const data = (await res.json()) as { count: number };
      toast.success(
        `${data.count} ${data.count === 1 ? "entity" : "entities"} assigned.`,
      );
      onAssigned?.();
      open = false;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      assigning = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>{view.title}</Dialog.Title>
      <Dialog.Description>
        Search by name, tick the ones to group under this brand, then assign.
        Items already on another brand will be moved here.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4">
      <Input
        type="text"
        placeholder={view.placeholder}
        bind:value={query}
        oninput={handleSearchInput}
      />

      <div class="max-h-96 overflow-y-auto rounded-md border">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head class="w-12">
                <button
                  type="button"
                  class="inline-flex disabled:cursor-not-allowed"
                  disabled={selectableRows.length === 0}
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
              <Table.Head>Name</Table.Head>
              <Table.Head>{view.subLabelHeader}</Table.Head>
              <Table.Head class="text-right">Status</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#if loading}
              <Table.Row>
                <Table.Cell
                  colspan={4}
                  class="text-muted-foreground py-10 text-center text-sm"
                >
                  Searching…
                </Table.Cell>
              </Table.Row>
            {:else if results.length === 0}
              <Table.Row>
                <Table.Cell
                  colspan={4}
                  class="text-muted-foreground py-10 text-center text-sm"
                >
                  {query.trim()
                    ? "No matches. Try a different search."
                    : "Type to search."}
                </Table.Cell>
              </Table.Row>
            {:else}
              {#each results as row (row.entityId)}
                {@const onThisBrand = isOnThisBrand(row)}
                <Table.Row>
                  <Table.Cell>
                    <button
                      type="button"
                      class="inline-flex disabled:cursor-not-allowed"
                      disabled={onThisBrand}
                      onclick={() => toggleRow(row)}
                      aria-label={`Select ${row.displayName}`}
                    >
                      <Checkbox
                        checked={onThisBrand || selected.has(row.entityId)}
                        disabled={onThisBrand}
                        class="pointer-events-none"
                      />
                    </button>
                  </Table.Cell>
                  <Table.Cell class="font-medium">{row.displayName}</Table.Cell>
                  <Table.Cell class="text-muted-foreground">
                    {row.subLabel ?? "—"}
                  </Table.Cell>
                  <Table.Cell class="text-right">
                    {#if onThisBrand}
                      <Badge variant="secondary">Assigned</Badge>
                    {:else if row.assignedBrandName}
                      <Badge variant="outline" title="Will be moved here">
                        {row.assignedBrandName} → move
                      </Badge>
                    {/if}
                  </Table.Cell>
                </Table.Row>
              {/each}
            {/if}
          </Table.Body>
        </Table.Root>
      </div>
    </div>

    <Dialog.Footer class="items-center gap-2 sm:justify-between">
      <span class="text-muted-foreground text-sm">
        {selected.size} selected
      </span>
      <Button
        type="button"
        disabled={assigning || selected.size === 0}
        onclick={assignSelected}
      >
        {assigning ? "Assigning…" : `Assign ${selected.size} selected`}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
