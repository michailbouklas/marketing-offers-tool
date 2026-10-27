<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { SvelteSet } from "svelte/reactivity";
  import { toast } from "svelte-sonner";
  import AssignEntitiesDialog from "$lib/components/admin/assign-entities-dialog.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import type {
    BrandAssignmentRow,
    BrandEntityType,
  } from "$lib/services/brand-entities";

  interface Props {
    brandId: number;
    assignments: BrandAssignmentRow[];
  }

  let { brandId, assignments }: Props = $props();

  let assignDialogOpen = $state(false);
  let assignEntityType = $state<BrandEntityType>("competitionRestaurant");
  let removingAssignmentId = $state<string | null>(null);
  const selectedAssignments = new SvelteSet<string>();
  let bulkRemoving = $state(false);

  // Drop selections that no longer exist after the list reloads.
  $effect(() => {
    const ids = new Set(assignments.map((assignment) => assignment.id));
    for (const id of selectedAssignments) {
      if (!ids.has(id)) {
        selectedAssignments.delete(id);
      }
    }
  });

  const competitionAssignments = $derived(
    assignments.filter(
      (assignment) => assignment.entityType === "competitionRestaurant",
    ),
  );
  const googleReviewsAssignments = $derived(
    assignments.filter(
      (assignment) => assignment.entityType === "googleReviewsBusiness",
    ),
  );
  const aggregatorStoreAssignments = $derived(
    assignments.filter(
      (assignment) => assignment.entityType === "aggregatorStore",
    ),
  );

  function openAssignDialog(entityType: BrandEntityType) {
    assignEntityType = entityType;
    assignDialogOpen = true;
  }

  async function removeAssignment(assignmentId: string) {
    if (removingAssignmentId) return;
    if (!confirm("Remove this entity from the brand?")) return;
    removingAssignmentId = assignmentId;
    try {
      const res = await fetch(`/api/admin/brand-entities/${assignmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Remove failed: ${res.status}`);
      }
      toast.success("Assignment removed.");
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      removingAssignmentId = null;
    }
  }

  function toggleAssignment(id: string) {
    if (selectedAssignments.has(id)) {
      selectedAssignments.delete(id);
    } else {
      selectedAssignments.add(id);
    }
  }

  function groupAllSelected(items: BrandAssignmentRow[]): boolean {
    return (
      items.length > 0 &&
      items.every((assignment) => selectedAssignments.has(assignment.id))
    );
  }

  function groupPartiallySelected(items: BrandAssignmentRow[]): boolean {
    return (
      !groupAllSelected(items) &&
      items.some((assignment) => selectedAssignments.has(assignment.id))
    );
  }

  function toggleGroup(items: BrandAssignmentRow[]) {
    const allSelected = groupAllSelected(items);
    for (const assignment of items) {
      if (allSelected) {
        selectedAssignments.delete(assignment.id);
      } else {
        selectedAssignments.add(assignment.id);
      }
    }
  }

  async function removeSelectedAssignments() {
    if (bulkRemoving || selectedAssignments.size === 0) return;
    const count = selectedAssignments.size;
    if (
      !confirm(
        `Remove ${count} ${count === 1 ? "entity" : "entities"} from this brand?`,
      )
    ) {
      return;
    }
    bulkRemoving = true;
    try {
      const res = await fetch("/api/admin/brand-entities", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [...selectedAssignments] }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Remove failed: ${res.status}`);
      }
      const result = (await res.json()) as { count: number };
      toast.success(
        `${result.count} ${result.count === 1 ? "entity" : "entities"} removed.`,
      );
      selectedAssignments.clear();
      await invalidateAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      bulkRemoving = false;
    }
  }
</script>

{#snippet assignmentGroup(heading: string, items: BrandAssignmentRow[])}
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      {#if items.length > 0}
        <button
          type="button"
          class="inline-flex"
          onclick={() => toggleGroup(items)}
          aria-label={`Select all ${heading}`}
        >
          <Checkbox
            checked={groupAllSelected(items)}
            indeterminate={groupPartiallySelected(items)}
            class="pointer-events-none"
          />
        </button>
      {/if}
      <h3 class="text-sm font-medium">
        {heading}
        <span class="text-muted-foreground">({items.length})</span>
      </h3>
    </div>
    {#if items.length === 0}
      <p class="text-muted-foreground text-sm">None assigned yet.</p>
    {:else}
      <ul class="divide-border divide-y rounded-md border">
        {#each items as assignment (assignment.id)}
          <li class="flex items-center gap-3 px-3 py-2">
            <button
              type="button"
              class="inline-flex shrink-0"
              onclick={() => toggleAssignment(assignment.id)}
              aria-label={`Select ${assignment.displayName ?? assignment.entityId}`}
            >
              <Checkbox
                checked={selectedAssignments.has(assignment.id)}
                class="pointer-events-none"
              />
            </button>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {assignment.displayName ?? assignment.entityId}
              </p>
              {#if assignment.subLabel}
                <p class="text-muted-foreground truncate text-xs">
                  {assignment.subLabel}
                </p>
              {/if}
            </div>
            <Button
              variant="ghost"
              size="sm"
              class="text-destructive shrink-0"
              disabled={removingAssignmentId !== null || bulkRemoving}
              onclick={() => removeAssignment(assignment.id)}
            >
              {removingAssignmentId === assignment.id ? "Removing…" : "Remove"}
            </Button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/snippet}

<Card.Root>
  <Card.Header
    class="flex flex-row flex-wrap items-start justify-between gap-3"
  >
    <div class="space-y-1.5">
      <Card.Title>Assigned entities</Card.Title>
      <Card.Description>
        Scraped competition restaurants and Google reviews businesses grouped
        under this brand.
      </Card.Description>
    </div>
    <div class="flex flex-wrap gap-2">
      {#if selectedAssignments.size > 0}
        <Button
          variant="destructive"
          size="sm"
          disabled={bulkRemoving}
          onclick={removeSelectedAssignments}
        >
          {bulkRemoving
            ? "Removing…"
            : `Remove selected (${selectedAssignments.size})`}
        </Button>
      {/if}
      <Button
        variant="outline"
        size="sm"
        onclick={() => openAssignDialog("competitionRestaurant")}
      >
        Assign competition restaurant
      </Button>
      <Button
        variant="outline"
        size="sm"
        onclick={() => openAssignDialog("googleReviewsBusiness")}
      >
        Assign Google reviews business
      </Button>
      <Button
        variant="outline"
        size="sm"
        onclick={() => openAssignDialog("aggregatorStore")}
      >
        Assign aggregator KPI store
      </Button>
    </div>
  </Card.Header>
  <Card.Content class="space-y-6">
    {@render assignmentGroup("Competition restaurants", competitionAssignments)}
    {@render assignmentGroup(
      "Google reviews businesses",
      googleReviewsAssignments,
    )}
    {@render assignmentGroup(
      "Aggregator KPI stores",
      aggregatorStoreAssignments,
    )}
  </Card.Content>
</Card.Root>

<AssignEntitiesDialog
  {brandId}
  entityType={assignEntityType}
  bind:open={assignDialogOpen}
  onAssigned={() => invalidateAll()}
/>
