<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import type { PendingSubmissionQueueItem } from "$lib/services/offers-data-quality";

  type Props = {
    submissions: PendingSubmissionQueueItem[];
    selectedIds: number[];
    processingIds: number[];
    ontoggleselection: (id: number) => void;
    ontoggleall: () => void;
    onopensubmission: (id: number) => void;
  };

  let {
    submissions,
    selectedIds,
    processingIds,
    ontoggleselection,
    ontoggleall,
    onopensubmission,
  }: Props = $props();

  const selectedIdSet = $derived(new Set(selectedIds));
  const processingIdSet = $derived(new Set(processingIds));
  const allSelected = $derived(
    submissions.length > 0 &&
      submissions.every((submission) => selectedIdSet.has(submission.id)),
  );
  const partiallySelected = $derived(
    !allSelected &&
      submissions.some((submission) => selectedIdSet.has(submission.id)),
  );

  function formatMoney(value: string | null) {
    return value ? `EUR ${value}` : "-";
  }

  function formatSubmittedAt(value: string) {
    return new Date(value).toLocaleString();
  }
</script>

<Table.Root>
  <Table.Header>
    <Table.Row>
      <Table.Head class="w-12">
        <button
          type="button"
          class="inline-flex"
          aria-label="Select all pending submissions"
          onclick={ontoggleall}
        >
          <Checkbox
            checked={allSelected}
            indeterminate={partiallySelected}
            class="pointer-events-none"
          />
        </button>
      </Table.Head>
      <Table.Head class="min-w-56">Item</Table.Head>
      <Table.Head class="min-w-32">Brand</Table.Head>
      <Table.Head class="min-w-44">Category path</Table.Head>
      <Table.Head class="min-w-64">Submitted values</Table.Head>
      <Table.Head class="min-w-40">Missing fields</Table.Head>
      <Table.Head class="min-w-48">Submitted by</Table.Head>
      <Table.Head class="min-w-44">Submitted at</Table.Head>
      <Table.Head class="min-w-28 text-right">Action</Table.Head>
    </Table.Row>
  </Table.Header>
  <Table.Body>
    {#if submissions.length === 0}
      <Table.Row>
        <Table.Cell
          colspan={9}
          class="text-muted-foreground py-12 text-center text-sm"
        >
          No pending submissions are waiting for review.
        </Table.Cell>
      </Table.Row>
    {:else}
      {#each submissions as submission (submission.id)}
        <Table.Row class="align-top">
          <Table.Cell>
            <button
              type="button"
              class="inline-flex disabled:cursor-not-allowed"
              aria-label={`Select submission ${submission.id}`}
              disabled={processingIdSet.has(submission.id)}
              onclick={() => ontoggleselection(submission.id)}
            >
              <Checkbox
                checked={selectedIdSet.has(submission.id)}
                disabled={processingIdSet.has(submission.id)}
                class="pointer-events-none"
              />
            </button>
          </Table.Cell>
          <Table.Cell>
            <div class="space-y-1">
              <p class="font-medium tracking-[-0.01em]">
                {submission.item_name}
              </p>
              <p class="text-muted-foreground font-mono text-xs">
                {submission.item_code}
              </p>
            </div>
          </Table.Cell>
          <Table.Cell>
            <Badge variant="outline">{submission.brand}</Badge>
          </Table.Cell>
          <Table.Cell>
            <div class="space-y-1 text-sm">
              <p>{submission.category}</p>
              <p class="text-muted-foreground">{submission.subcategory}</p>
            </div>
          </Table.Cell>
          <Table.Cell>
            <div class="grid gap-1 text-sm">
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">Ideal</span>
                <span>{formatMoney(submission.ideal_price)}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">Selling</span>
                <span>{formatMoney(submission.selling_price)}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">FC %</span>
                <span>{submission.fc_perc}%</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">Spend</span>
                <span>{formatMoney(submission.mktg_spend)}</span>
              </div>
            </div>
          </Table.Cell>
          <Table.Cell>
            <div class="flex flex-wrap gap-1.5">
              {#each submission.missing_fields as field (`${submission.id}-${field}`)}
                <Badge variant="secondary">{field}</Badge>
              {/each}
            </div>
          </Table.Cell>
          <Table.Cell>
            <p class="font-mono text-xs break-all">{submission.submitted_by}</p>
          </Table.Cell>
          <Table.Cell class="text-sm"
            >{formatSubmittedAt(submission.submitted_at)}</Table.Cell
          >
          <Table.Cell class="text-right">
            <Button
              variant="outline"
              size="sm"
              disabled={processingIdSet.has(submission.id)}
              onclick={() => onopensubmission(submission.id)}
            >
              Review
            </Button>
          </Table.Cell>
        </Table.Row>
      {/each}
    {/if}
  </Table.Body>
</Table.Root>
