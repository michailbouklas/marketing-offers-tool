<script lang="ts">
  import { toast } from "svelte-sonner";
  import CheckCheckIcon from "@lucide/svelte/icons/check-check";
  import ListTodoIcon from "@lucide/svelte/icons/list-todo";
  import XIcon from "@lucide/svelte/icons/x";
  import PendingSubmissionDialog from "$lib/components/admin/pending-submission-dialog.svelte";
  import PendingSubmissionsTable from "$lib/components/admin/pending-submissions-table.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    bulkDecidePendingSubmissions,
    decidePendingSubmission,
  } from "$lib/services/admin-pending-submissions";
  import type {
    PendingSubmissionDecision,
    PendingSubmissionQueueItem,
  } from "$lib/services/offers-data-quality";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let removedIds = $state<number[]>([]);
  let selectedIds = $state<number[]>([]);
  let processingIds = $state<number[]>([]);
  let processingDecision = $state<PendingSubmissionDecision | null>(null);
  let detailOpen = $state(false);
  let detailSubmissionId = $state<number | null>(null);

  const removedIdSet = $derived(new Set(removedIds));
  const submissions = $derived(
    data.submissions.filter((submission) => !removedIdSet.has(submission.id)),
  );
  const selectedIdSet = $derived(new Set(selectedIds));
  const processingIdSet = $derived(new Set(processingIds));
  const pendingCount = $derived(submissions.length);
  const selectedCount = $derived(selectedIds.length);
  const activeSubmission = $derived(
    submissions.find((submission) => submission.id === detailSubmissionId) ??
      null,
  );

  function toggleSelection(id: number) {
    if (processingIdSet.has(id)) {
      return;
    }

    if (selectedIdSet.has(id)) {
      selectedIds = selectedIds.filter((value) => value !== id);
      return;
    }

    selectedIds = [...selectedIds, id];
  }

  function toggleAll() {
    const availableIds = submissions
      .filter((submission) => !processingIdSet.has(submission.id))
      .map((submission) => submission.id);

    const allSelected =
      availableIds.length > 0 &&
      availableIds.every((id) => selectedIdSet.has(id));

    selectedIds = allSelected ? [] : availableIds;
  }

  function openSubmission(id: number) {
    detailSubmissionId = id;
    detailOpen = true;
  }

  function clearProcessedSubmissions(processedIds: number[]) {
    if (processedIds.length === 0) {
      return;
    }

    const processedIdSet = new Set(processedIds);

    removedIds = [...removedIds, ...processedIds];
    selectedIds = selectedIds.filter((id) => !processedIdSet.has(id));

    if (detailSubmissionId !== null && processedIdSet.has(detailSubmissionId)) {
      detailSubmissionId = null;
      detailOpen = false;
    }
  }

  async function handleSingleDecision(decision: PendingSubmissionDecision) {
    if (!activeSubmission) {
      return;
    }

    processingIds = [activeSubmission.id];
    processingDecision = decision;

    try {
      await decidePendingSubmission(fetch, activeSubmission.id, decision);
      clearProcessedSubmissions([activeSubmission.id]);
      toast.success(
        decision === "approve"
          ? `Approved ${activeSubmission.item_name}.`
          : `Rejected ${activeSubmission.item_name}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Unable to ${decision} submission.`,
      );
    } finally {
      processingIds = [];
      processingDecision = null;
    }
  }

  async function handleBulkDecision(decision: PendingSubmissionDecision) {
    if (selectedIds.length === 0) {
      toast.error("Select at least one submission first.");
      return;
    }

    processingIds = [...selectedIds];
    processingDecision = decision;

    try {
      const result = await bulkDecidePendingSubmissions(
        fetch,
        selectedIds,
        decision,
      );

      clearProcessedSubmissions(result.processedIds);
      selectedIds = result.failed.map((failure) => failure.id);

      if (result.failed.length > 0) {
        toast.error(
          `${result.processedIds.length} processed, ${result.failed.length} failed.`,
        );
        return;
      }

      toast.success(
        decision === "approve"
          ? `Approved ${result.processedIds.length} submissions.`
          : `Rejected ${result.processedIds.length} submissions.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Unable to ${decision} selected submissions.`,
      );
    } finally {
      processingIds = [];
      processingDecision = null;
    }
  }
</script>

<svelte:head>
  <title>Pending Submissions | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Review, approve, or reject pending pricing submissions from the admin workspace."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[24rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-1)_18%,transparent),transparent_32%),radial-gradient(circle_at_90%_18%,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_28%)]"
  ></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
      <div class="space-y-3">
        <Badge
          variant="outline"
          class="px-3 py-1 text-[0.7rem] tracking-[0.22em] uppercase"
        >
          Admin review queue
        </Badge>
        <div class="space-y-2">
          <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
            Pending submissions
          </h1>
          <p class="text-muted-foreground max-w-3xl text-base leading-7">
            Review every staged pricing correction in one place, open individual
            submissions in a dialog, and process multiple items at once.
          </p>
        </div>
      </div>

      <Card.Root
        class="border-border/70 bg-background/90 shadow-sm backdrop-blur"
      >
        <Card.Content class="grid gap-4 p-5">
          <div>
            <p class="text-3xl font-semibold tracking-[-0.04em]">
              {pendingCount}
            </p>
            <p class="text-muted-foreground mt-1 text-sm">
              Awaiting admin decision
            </p>
          </div>
          <p class="text-muted-foreground text-sm leading-6">
            Bulk actions stay available while the queue is open.
          </p>
        </Card.Content>
      </Card.Root>
    </section>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
    >
      <Card.Header>
        <div
          class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
        >
          <div class="space-y-1">
            <Card.Title class="text-2xl tracking-[-0.03em]"
              >Admin review table</Card.Title
            >
            <Card.Description>
              Select multiple rows for a bulk decision, or open any submission
              for a side-by-side review.
            </Card.Description>
          </div>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div
              class="bg-muted/50 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
            >
              <ListTodoIcon class="text-muted-foreground size-4" />
              <span>{selectedCount} selected</span>
            </div>
            <Button
              disabled={selectedCount === 0 || processingIds.length > 0}
              onclick={() => handleBulkDecision("approve")}
            >
              <CheckCheckIcon class="size-4" />
              Approve selected
            </Button>
            <Button
              variant="outline"
              class="border-destructive/30 text-destructive hover:bg-destructive/6"
              disabled={selectedCount === 0 || processingIds.length > 0}
              onclick={() => handleBulkDecision("reject")}
            >
              <XIcon class="size-4" />
              Reject selected
            </Button>
          </div>
        </div>
      </Card.Header>
      <Card.Content>
        <PendingSubmissionsTable
          {submissions}
          {selectedIds}
          {processingIds}
          ontoggleselection={toggleSelection}
          ontoggleall={toggleAll}
          onopensubmission={openSubmission}
        />
      </Card.Content>
    </Card.Root>

    <PendingSubmissionDialog
      bind:open={detailOpen}
      submission={activeSubmission}
      {processingDecision}
      ondecide={handleSingleDecision}
    />
  </main>
</div>
