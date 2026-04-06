<script lang="ts">
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import type {
    PendingSubmissionDecision,
    PendingSubmissionQueueItem,
  } from "$lib/services/offers-data-quality";

  type Props = {
    submission: PendingSubmissionQueueItem | null;
    open?: boolean;
    processingDecision: PendingSubmissionDecision | null;
    ondecide: (decision: PendingSubmissionDecision) => void;
  };

  let {
    submission,
    open = $bindable(false),
    processingDecision,
    ondecide,
  }: Props = $props();

  const comparisonRows = $derived.by(() => {
    if (!submission) {
      return [];
    }

    return [
      {
        label: "Channel",
        current: submission.current_dim_offers.channel ?? "-",
        proposed: submission.channel,
      },
      {
        label: "Category",
        current: submission.current_dim_offers.category ?? "-",
        proposed: submission.category,
      },
      {
        label: "Subcategory",
        current: submission.current_dim_offers.subcategory ?? "-",
        proposed: submission.subcategory,
      },
      {
        label: "Ideal price",
        current: formatCurrentMoney(submission.current_dim_offers.ideal_price),
        proposed: formatSubmittedMoney(submission.ideal_price),
      },
      {
        label: "Selling price",
        current: formatCurrentMoney(
          submission.current_dim_offers.selling_price,
        ),
        proposed: formatSubmittedMoney(submission.selling_price),
      },
      {
        label: "FC %",
        current:
          submission.current_dim_offers.fc_perc === null
            ? "-"
            : `${(submission.current_dim_offers.fc_perc * 100).toFixed(2)}%`,
        proposed: `${submission.fc_perc}%`,
      },
      {
        label: "Marketing spend",
        current: formatCurrentMoney(submission.current_dim_offers.mktg_spend),
        proposed: formatSubmittedMoney(submission.mktg_spend),
      },
    ];
  });

  function formatCurrentMoney(value: number | null) {
    return value === null ? "-" : `EUR ${value.toFixed(2)}`;
  }

  function formatSubmittedMoney(value: string | null) {
    return value ? `EUR ${value}` : "-";
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
    <Dialog.Header>
      <Dialog.Title>Submission review</Dialog.Title>
      <Dialog.Description>
        Review the staged values before writing them into `dim_offers`.
      </Dialog.Description>
    </Dialog.Header>

    {#if submission}
      <div class="grid gap-6 py-2">
        <div class="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            class="gap-2 px-3 py-1.5 font-mono text-[0.72rem]"
          >
            Item code
            <span class="text-primary">{submission.item_code}</span>
          </Badge>
          <Badge
            variant="outline"
            class="gap-2 px-3 py-1.5 font-mono text-[0.72rem]"
          >
            Brand
            <span>{submission.brand}</span>
          </Badge>
          <Badge
            variant="outline"
            class="gap-2 px-3 py-1.5 font-mono text-[0.72rem]"
          >
            Transaction category
            <span>{submission.item_category}</span>
          </Badge>
          <Badge variant="secondary">Pending</Badge>
        </div>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div class="space-y-4 rounded-2xl border p-4">
            <div>
              <p class="text-lg font-semibold tracking-[-0.02em]">
                {submission.item_name}
              </p>
              <p class="text-muted-foreground mt-1 text-sm">
                Submitted by `{submission.submitted_by}` on
                {new Date(submission.submitted_at).toLocaleString()}.
              </p>
            </div>

            <div class="space-y-2">
              <p class="text-sm font-medium">Missing fields</p>
              <div class="flex flex-wrap gap-1.5">
                {#each submission.missing_fields as field (`${submission.id}-${field}`)}
                  <Badge variant="secondary">{field}</Badge>
                {/each}
              </div>
            </div>
          </div>

          <div class="rounded-2xl border p-4">
            <p class="text-sm font-medium">Submitted values</p>
            <div class="mt-3 grid gap-2 text-sm">
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">Channel</span>
                <span>{submission.channel}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">Category</span>
                <span>{submission.category}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">Subcategory</span>
                <span>{submission.subcategory}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">Ideal price</span>
                <span>{formatSubmittedMoney(submission.ideal_price)}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">Selling price</span>
                <span>{formatSubmittedMoney(submission.selling_price)}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">FC %</span>
                <span>{submission.fc_perc}%</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted-foreground">Marketing spend</span>
                <span>{formatSubmittedMoney(submission.mktg_spend)}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="overflow-x-auto rounded-2xl border">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Field</Table.Head>
                <Table.Head>Current</Table.Head>
                <Table.Head>Submitted</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each comparisonRows as row (row.label)}
                <Table.Row>
                  <Table.Cell class="font-medium">{row.label}</Table.Cell>
                  <Table.Cell class="text-muted-foreground"
                    >{row.current}</Table.Cell
                  >
                  <Table.Cell>
                    <div class="flex items-center gap-2">
                      <span>{row.proposed}</span>
                      {#if row.current !== row.proposed}
                        <Badge variant="secondary">Changed</Badge>
                      {/if}
                    </div>
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </div>

        <div class="space-y-2">
          <p class="text-sm font-medium">Notes</p>
          <Textarea value={submission.notes ?? "-"} rows={5} disabled />
        </div>
      </div>

      <Dialog.Footer class="gap-2 sm:justify-between">
        <Button
          variant="outline"
          onclick={() => (open = false)}
          disabled={processingDecision !== null}
        >
          Close
        </Button>
        <div class="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="outline"
            class="border-destructive/30 text-destructive hover:bg-destructive/6"
            disabled={processingDecision !== null}
            onclick={() => ondecide("reject")}
          >
            {#if processingDecision === "reject"}
              <LoaderCircleIcon class="size-4 animate-spin" />
              Rejecting...
            {:else}
              Reject submission
            {/if}
          </Button>
          <Button
            disabled={processingDecision !== null}
            onclick={() => ondecide("approve")}
          >
            {#if processingDecision === "approve"}
              <LoaderCircleIcon class="size-4 animate-spin" />
              Approving...
            {:else}
              Approve submission
            {/if}
          </Button>
        </div>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
