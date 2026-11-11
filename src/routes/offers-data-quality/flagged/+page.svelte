<script lang="ts">
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import Undo2Icon from "@lucide/svelte/icons/undo-2";
  import { toast } from "svelte-sonner";
  import { goto, invalidateAll } from "$app/navigation";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  let selectedIds = $state<number[]>([]);
  let confirmRestoreOpen = $state(false);
  let isRestoring = $state(false);

  const gaps = $derived(data.flaggedGaps);
  const isFlagged = $derived(data.type === "flagged");
  const statusVariant = {
    pending: "secondary",
    approved: "outline",
    rejected: "destructive",
  } as const;

  function selectType(value: string) {
    selectedIds = [];
    goto(value === "flagged" ? "?type=flagged" : "?", {
      keepFocus: true,
      noScroll: true,
    });
  }
  const selectedIdSet = $derived(new Set(selectedIds));
  const allSelected = $derived(
    gaps.length > 0 && gaps.every((gap) => selectedIdSet.has(gap.dq_id)),
  );

  function toggleAllRows() {
    selectedIds = allSelected ? [] : gaps.map((gap) => gap.dq_id);
  }

  function toggleRow(dqId: number, checked: boolean) {
    selectedIds = checked
      ? [...selectedIds, dqId]
      : selectedIds.filter((id) => id !== dqId);
  }

  function formatDate(value: string | null) {
    return value ? new Date(value).toLocaleString() : "—";
  }

  async function restoreSelected() {
    isRestoring = true;
    try {
      const response = await fetch("/api/gaps/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) {
        throw new Error(`Restore failed (${response.status})`);
      }
      const result = (await response.json()) as {
        processedIds: number[];
        failed: Array<{ id: number; error: string }>;
      };
      if (result.processedIds.length > 0) {
        toast.success(
          `Restored ${result.processedIds.length} gap${result.processedIds.length === 1 ? "" : "s"} to the queue.`,
        );
      }
      if (result.failed.length > 0) {
        toast.error(
          `${result.failed.length} not restored: ${result.failed[0].error}.`,
        );
      }
      confirmRestoreOpen = false;
      selectedIds = [];
      await invalidateAll();
    } catch {
      toast.error("The selected gaps could not be restored. Try again.");
    } finally {
      isRestoring = false;
    }
  }
</script>

<svelte:head>
  <title>Flagged offers | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Offers dismissed from the pricing gap queue or flagged for review."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>

  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
    <div
      class="flex flex-wrap items-center gap-2 text-xs tracking-[0.18em] text-zinc-500 uppercase"
    >
      <a href="/offers-data-quality" class="hover:text-foreground">Gap list</a>
      <ChevronRightIcon class="size-3" />
      <span>Flagged offers</span>
    </div>

    <div class="space-y-2">
      <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
        Flagged offers
      </h1>
      <p class="text-muted-foreground max-w-3xl text-base leading-7">
        {#if isFlagged}
          Submissions whose selling price is above the ideal price. They still
          go through normal approval.
        {:else}
          Offers dismissed from the gap queue as invalid or outdated. They are
          not re-detected by the nightly refresh until restored.
        {/if}
      </p>
    </div>

    <Tabs.Root value={data.type} onValueChange={selectType}>
      <Tabs.List>
        <Tabs.Trigger value="dismissed">Dismissed</Tabs.Trigger>
        <Tabs.Trigger value="flagged">Flagged</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>

    <Card.Root
      class="border-border/70 bg-background/90 overflow-hidden shadow-sm backdrop-blur"
    >
      <Card.Header
        class="flex flex-row flex-wrap items-center justify-between gap-3"
      >
        <div>
          <Card.Title class="text-2xl tracking-[-0.03em]">
            {isFlagged
              ? `${data.priceFlagged.length} flagged`
              : `${gaps.length} removed`}
          </Card.Title>
          <Card.Description>Limited to your assigned brands.</Card.Description>
        </div>
        <div class="flex items-center gap-2">
          <Button href="/offers-data-quality" variant="outline" size="sm">
            <ArrowLeftIcon class="size-4" />
            Back to queue
          </Button>
          {#if !isFlagged}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                class={buttonVariants({ variant: "outline", size: "sm" })}
                disabled={selectedIds.length === 0}
              >
                Actions
                {#if selectedIds.length > 0}
                  <Badge variant="secondary" class="px-1.5">
                    {selectedIds.length}
                  </Badge>
                {/if}
                <ChevronDownIcon class="size-4 opacity-60" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" class="w-52">
                <DropdownMenu.Item onSelect={() => (confirmRestoreOpen = true)}>
                  <Undo2Icon />
                  Restore to queue
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {/if}
        </div>
      </Card.Header>
      <Card.Content>
        {#if isFlagged}
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Item</Table.Head>
                <Table.Head>Brand</Table.Head>
                <Table.Head class="text-right">Selling</Table.Head>
                <Table.Head class="text-right">Ideal</Table.Head>
                <Table.Head class="text-right">Over by</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Submitted</Table.Head>
                <Table.Head>Submitted by</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#if data.priceFlagged.length === 0}
                <Table.Row>
                  <Table.Cell
                    colspan={8}
                    class="text-muted-foreground py-10 text-center"
                  >
                    No submissions above ideal price.
                  </Table.Cell>
                </Table.Row>
              {:else}
                {#each data.priceFlagged as row (row.id)}
                  <Table.Row>
                    <Table.Cell>
                      <div class="space-y-1">
                        {#if row.status === "pending"}
                          <a
                            href={`/offers-data-quality/${row.dq_id}`}
                            class="font-medium hover:underline"
                            >{row.item_name}</a
                          >
                        {:else}
                          <p class="font-medium">{row.item_name}</p>
                        {/if}
                        <p class="text-muted-foreground font-mono text-xs">
                          {row.trde_item}
                        </p>
                      </div>
                    </Table.Cell>
                    <Table.Cell>{row.brand}</Table.Cell>
                    <Table.Cell class="text-right tabular-nums"
                      >EUR {row.selling_price}</Table.Cell
                    >
                    <Table.Cell class="text-right tabular-nums"
                      >EUR {row.ideal_price}</Table.Cell
                    >
                    <Table.Cell class="text-destructive text-right tabular-nums"
                      >+{row.over_by}</Table.Cell
                    >
                    <Table.Cell>
                      <Badge
                        variant={statusVariant[row.status]}
                        class="capitalize">{row.status}</Badge
                      >
                    </Table.Cell>
                    <Table.Cell>{formatDate(row.submitted_at)}</Table.Cell>
                    <Table.Cell>{row.submitted_by_name}</Table.Cell>
                  </Table.Row>
                {/each}
              {/if}
            </Table.Body>
          </Table.Root>
        {:else}
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head class="w-10">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={selectedIds.length > 0 && !allSelected}
                    disabled={gaps.length === 0}
                    onCheckedChange={toggleAllRows}
                    aria-label="Select all removed offers"
                  />
                </Table.Head>
                <Table.Head>Item</Table.Head>
                <Table.Head>Brand</Table.Head>
                <Table.Head>Transaction category</Table.Head>
                <Table.Head>Missing fields</Table.Head>
                <Table.Head>Detected</Table.Head>
                <Table.Head>Removed at</Table.Head>
                <Table.Head>Removed by</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#if gaps.length === 0}
                <Table.Row>
                  <Table.Cell
                    colspan={8}
                    class="text-muted-foreground py-10 text-center"
                  >
                    No offers have been removed.
                  </Table.Cell>
                </Table.Row>
              {:else}
                {#each gaps as gap (gap.dq_id)}
                  <Table.Row
                    data-state={selectedIdSet.has(gap.dq_id)
                      ? "selected"
                      : undefined}
                  >
                    <Table.Cell>
                      <Checkbox
                        checked={selectedIdSet.has(gap.dq_id)}
                        onCheckedChange={(checked) =>
                          toggleRow(gap.dq_id, checked === true)}
                        aria-label={`Select ${gap.item_name}`}
                      />
                    </Table.Cell>
                    <Table.Cell>
                      <div class="space-y-1">
                        <p class="font-medium">{gap.item_name}</p>
                        <p class="text-muted-foreground font-mono text-xs">
                          {gap.trde_item}
                        </p>
                      </div>
                    </Table.Cell>
                    <Table.Cell>{gap.brand}</Table.Cell>
                    <Table.Cell>{gap.item_category}</Table.Cell>
                    <Table.Cell>
                      <div class="flex flex-wrap gap-2">
                        {#each gap.missing_fields as field (field)}
                          <Badge variant="outline">{field}</Badge>
                        {/each}
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      {new Date(gap.detected_at).toLocaleDateString()}
                    </Table.Cell>
                    <Table.Cell>{formatDate(gap.dismissed_at)}</Table.Cell>
                    <Table.Cell>{gap.dismissed_by_name ?? "—"}</Table.Cell>
                  </Table.Row>
                {/each}
              {/if}
            </Table.Body>
          </Table.Root>
        {/if}
      </Card.Content>
    </Card.Root>

    <AlertDialog.Root bind:open={confirmRestoreOpen}>
      <AlertDialog.Content>
        <AlertDialog.Header>
          <AlertDialog.Title>
            Restore {selectedIds.length} offer{selectedIds.length === 1
              ? ""
              : "s"} to the queue?
          </AlertDialog.Title>
          <AlertDialog.Description>
            They reappear in the gap queue as open. Offers that have been priced
            or deactivated since are closed again by the nightly refresh.
          </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
          <AlertDialog.Cancel disabled={isRestoring}>Cancel</AlertDialog.Cancel>
          <Button disabled={isRestoring} onclick={restoreSelected}>
            {#if isRestoring}
              <LoaderCircleIcon class="size-4 animate-spin" />
            {/if}
            Restore
          </Button>
        </AlertDialog.Footer>
      </AlertDialog.Content>
    </AlertDialog.Root>
  </main>
</div>
