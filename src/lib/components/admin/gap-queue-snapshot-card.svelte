<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import { toast } from "svelte-sonner";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import type { SnapshotRefreshInfo } from "$lib/services/offers-data-quality-snapshot";

  type Props = {
    lastRefresh: SnapshotRefreshInfo | null;
  };

  let { lastRefresh }: Props = $props();
  let rebuilding = $state(false);

  const statusVariant = $derived(
    lastRefresh?.status === "succeeded"
      ? "secondary"
      : lastRefresh?.status === "failed"
        ? "destructive"
        : "outline",
  );

  function formatDate(value: Date | string | null | undefined) {
    return value ? new Date(value).toLocaleString() : "never";
  }

  async function rebuildNow() {
    rebuilding = true;

    try {
      const response = await fetch("/api/admin/data-quality/rebuild-snapshot", {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as {
        reason?: string;
        error?: string;
        summary?: {
          snapshotRows: number;
          createdGaps: number;
          resolvedGaps: number;
          durationMs: number;
        };
      };

      if (!response.ok || !body.summary) {
        toast.error(body.reason ?? body.error ?? "Gap queue rebuild failed.");
        return;
      }

      toast.success(
        `Gap queue rebuilt in ${(body.summary.durationMs / 1000).toFixed(1)}s: ${body.summary.snapshotRows} items in queue, ${body.summary.createdGaps} new gaps, ${body.summary.resolvedGaps} auto-resolved.`,
      );
      await invalidateAll();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gap queue rebuild failed.",
      );
    } finally {
      rebuilding = false;
    }
  }
</script>

<Card.Root class="border-border/70 bg-background/90 shadow-sm backdrop-blur">
  <Card.Header>
    <div
      class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="space-y-1">
        <Card.Title class="text-xl tracking-[-0.03em]"
          >Gap queue snapshot</Card.Title
        >
        <Card.Description>
          The open-gaps queue is detected from ClickHouse once per night (04:00)
          and stored in Postgres. Rebuild it now to pick up new items or pricing
          fixed outside the tool.
        </Card.Description>
      </div>
      <Button onclick={rebuildNow} disabled={rebuilding}>
        <RefreshCwIcon class={`size-4 ${rebuilding ? "animate-spin" : ""}`} />
        {rebuilding ? "Rebuilding…" : "Rebuild now"}
      </Button>
    </div>
  </Card.Header>
  <Card.Content>
    {#if lastRefresh}
      <dl class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt class="text-muted-foreground">Last run</dt>
          <dd class="font-medium">
            {formatDate(lastRefresh.finished_at ?? lastRefresh.started_at)}
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Outcome</dt>
          <dd class="flex items-center gap-2">
            <Badge variant={statusVariant}>{lastRefresh.status}</Badge>
            <span class="text-muted-foreground text-xs"
              >via {lastRefresh.trigger}</span
            >
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Items in queue</dt>
          <dd class="font-medium">{lastRefresh.snapshot_rows ?? "—"}</dd>
        </div>
        <div>
          <dt class="text-muted-foreground">Gaps created / resolved</dt>
          <dd class="font-medium">
            {lastRefresh.created_gaps ?? "—"} / {lastRefresh.resolved_gaps ??
              "—"}
          </dd>
        </div>
      </dl>
      {#if lastRefresh.error}
        <p class="text-destructive mt-3 text-sm">{lastRefresh.error}</p>
      {/if}
    {:else}
      <p class="text-muted-foreground text-sm">
        The snapshot has not been built yet. Rebuild it now, or wait for the
        first nightly run.
      </p>
    {/if}
  </Card.Content>
</Card.Root>
