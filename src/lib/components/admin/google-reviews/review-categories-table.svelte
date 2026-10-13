<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import type { ReviewCategoryRow } from "$lib/services/google-reviews-admin/categories";

  type Props = {
    rows: ReviewCategoryRow[];
    selectedIds: number[];
    processingIds: number[];
    ontoggleselection: (id: number) => void;
    ontoggleall: () => void;
    onopen: (id: number) => void;
  };

  let {
    rows,
    selectedIds,
    processingIds,
    ontoggleselection,
    ontoggleall,
    onopen,
  }: Props = $props();

  const selectedIdSet = $derived(new Set(selectedIds));
  const processingIdSet = $derived(new Set(processingIds));
  const allSelected = $derived(
    rows.length > 0 && rows.every((row) => selectedIdSet.has(row.id)),
  );
  const partiallySelected = $derived(
    !allSelected && rows.some((row) => selectedIdSet.has(row.id)),
  );

  const numberFormatter = new Intl.NumberFormat("en-GB");

  /** Drill down to every review tagged with this category. */
  function getCategoryReviewsHref(categoryId: number) {
    const params = new URLSearchParams({ categoryId: categoryId.toString() });
    return `/google-reviews/reviews?${params.toString()}`;
  }
</script>

<Tooltip.Provider delayDuration={150}>
  <Table.Root>
    <Table.Header>
      <Table.Row>
        <Table.Head class="w-12">
          <button
            type="button"
            class="inline-flex"
            aria-label="Select all categories on this page"
            onclick={ontoggleall}
          >
            <Checkbox
              checked={allSelected}
              indeterminate={partiallySelected}
              class="pointer-events-none"
            />
          </button>
        </Table.Head>
        <Table.Head class="min-w-56">Category</Table.Head>
        <Table.Head class="min-w-72">Summary</Table.Head>
        <Table.Head class="w-28 text-right">Reviews</Table.Head>
        <Table.Head class="w-24 text-right">Version</Table.Head>
        <Table.Head class="w-28">Active</Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#if rows.length === 0}
        <Table.Row>
          <Table.Cell
            colspan={6}
            class="text-muted-foreground py-12 text-center text-sm"
          >
            No categories match the current filters.
          </Table.Cell>
        </Table.Row>
      {:else}
        {#each rows as row (row.id)}
          <Table.Row class="align-top">
            <Table.Cell>
              <button
                type="button"
                class="inline-flex disabled:cursor-not-allowed"
                aria-label={`Select category ${row.category ?? row.id}`}
                disabled={processingIdSet.has(row.id)}
                onclick={() => ontoggleselection(row.id)}
              >
                <Checkbox
                  checked={selectedIdSet.has(row.id)}
                  disabled={processingIdSet.has(row.id)}
                  class="pointer-events-none"
                />
              </button>
            </Table.Cell>
            <Table.Cell>
              <button
                type="button"
                class="text-primary text-left font-medium tracking-[-0.01em] hover:underline focus-visible:underline focus-visible:outline-none"
                onclick={() => onopen(row.id)}
              >
                {row.category?.trim() || `(unnamed #${row.id})`}
              </button>
            </Table.Cell>
            <Table.Cell>
              {#if row.summary && row.summary.trim().length > 0}
                <Tooltip.Root>
                  <Tooltip.Trigger
                    class="block max-w-[28rem] min-w-0 cursor-default text-left"
                  >
                    <span
                      class="text-muted-foreground block max-w-[28rem] truncate text-sm"
                    >
                      {row.summary}
                    </span>
                  </Tooltip.Trigger>
                  <Tooltip.Content
                    class="max-w-md text-sm leading-6 break-words whitespace-pre-line"
                  >
                    {row.summary}
                  </Tooltip.Content>
                </Tooltip.Root>
              {:else}
                <span class="text-muted-foreground text-sm">-</span>
              {/if}
            </Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              {#if row.reviewCount > 0}
                <a
                  href={getCategoryReviewsHref(row.id)}
                  class="text-primary hover:underline focus-visible:underline focus-visible:outline-none"
                  aria-label={`View reviews for ${row.category?.trim() || `category #${row.id}`}`}
                >
                  {numberFormatter.format(row.reviewCount)}
                </a>
              {:else}
                {numberFormatter.format(row.reviewCount)}
              {/if}
            </Table.Cell>
            <Table.Cell class="text-right tabular-nums">
              {row.version}
            </Table.Cell>
            <Table.Cell>
              {#if row.isActive}
                <Badge variant="secondary">Active</Badge>
              {:else}
                <Badge variant="outline" class="text-muted-foreground">
                  Inactive
                </Badge>
              {/if}
            </Table.Cell>
          </Table.Row>
        {/each}
      {/if}
    </Table.Body>
  </Table.Root>
</Tooltip.Provider>
