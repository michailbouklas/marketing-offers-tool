<script lang="ts">
  import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import CircleSlashIcon from "@lucide/svelte/icons/circle-slash";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import OctagonXIcon from "@lucide/svelte/icons/octagon-x";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import type { ScrapeStage } from "$lib/services/google-reviews-admin/scrape-run";
  import { placeScrapeStream } from "$lib/state/place-scrape-stream.svelte";

  let {
    open = $bindable(false),
    placeId,
  }: { open?: boolean; placeId: number | null } = $props();

  const run = $derived(
    placeId === null ? null : placeScrapeStream.getRun(placeId),
  );
  const isRunning = $derived(run?.status === "running");
  const canRunAgain = $derived(
    placeId !== null && !isRunning && !placeScrapeStream.isRunning,
  );

  let consoleEl = $state<HTMLDivElement | null>(null);

  const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function formatDateTime(value: string | null) {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : dateTimeFormatter.format(date);
  }

  function formatDuration(ms: number | null) {
    if (ms === null) {
      return null;
    }
    return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
  }

  function formatCounts(counts: ScrapeStage["counts"]) {
    if (!counts) {
      return null;
    }
    return Object.entries(counts)
      .map(([key, value]) => `${key} ${value}`)
      .join(", ");
  }

  // Auto-scroll the console to the newest line.
  $effect(() => {
    void run?.logs.length;
    if (consoleEl) {
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  });

  async function runAgain() {
    if (placeId === null) {
      return;
    }
    await placeScrapeStream.start(placeId);
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90vh] gap-4 overflow-hidden sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        {#if !run}
          Scrape now
        {:else if run.status === "running"}
          <LoaderCircleIcon class="text-muted-foreground size-4 animate-spin" />
          Scraping "{run.query}"
        {:else if run.status === "succeeded"}
          <CircleCheckIcon class="size-4 text-emerald-500" />
          Scrape finished
        {:else}
          <OctagonXIcon class="text-destructive size-4" />
          Scrape failed
        {/if}
      </Dialog.Title>
      <Dialog.Description>
        Runs the scrape and import stages for this place right now and shows the
        live pipeline log. The run keeps going on the server if you close this
        dialog; reopen it from the row to follow along.
      </Dialog.Description>
    </Dialog.Header>

    {#if run}
      <div class="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span>
          Place <span class="text-foreground">{run.query}</span>
          <span class="font-mono">#{run.placeId}</span>
        </span>
        <span>
          Started
          <span class="text-foreground">{formatDateTime(run.startedAt)}</span>
        </span>
        {#if run.finishedAt}
          <span>
            Finished
            <span class="text-foreground">{formatDateTime(run.finishedAt)}</span
            >
          </span>
        {/if}
        {#if run.runId}
          <span>
            Run <span class="text-foreground font-mono">{run.runId}</span>
          </span>
        {/if}
      </div>

      {#if run.stages.length > 0}
        <div class="flex flex-wrap gap-2">
          {#each run.stages as stage (stage.stage)}
            <Badge
              variant={stage.status === "failed" ? "destructive" : "outline"}
              class="gap-1.5 px-2.5 py-1 text-xs font-normal"
            >
              {#if stage.status === "started"}
                <LoaderCircleIcon class="size-3.5 animate-spin" />
              {:else if stage.status === "ok"}
                <CircleCheckIcon class="size-3.5 text-emerald-500" />
              {:else if stage.status === "warn"}
                <CircleAlertIcon class="size-3.5 text-amber-500" />
              {:else if stage.status === "skipped"}
                <CircleSlashIcon class="text-muted-foreground size-3.5" />
              {:else}
                <OctagonXIcon class="size-3.5" />
              {/if}
              <span class="font-medium">{stage.stage}</span>
              <span class="opacity-80">{stage.status}</span>
              {#if formatDuration(stage.durationMs)}
                <span class="opacity-80"
                  >· {formatDuration(stage.durationMs)}</span
                >
              {/if}
              {#if formatCounts(stage.counts)}
                <span class="opacity-80">· {formatCounts(stage.counts)}</span>
              {/if}
            </Badge>
          {/each}
        </div>
      {/if}

      <div
        bind:this={consoleEl}
        class="bg-muted/40 h-80 overflow-y-auto rounded-lg border p-3 font-mono text-xs leading-5"
      >
        {#if run.logs.length === 0}
          <p class="text-muted-foreground">
            {isRunning ? "Waiting for the scraper…" : "No log output."}
          </p>
        {:else}
          {#each run.logs as entry (entry.seq)}
            <p
              class={entry.stream === "stderr"
                ? "text-destructive whitespace-pre-wrap"
                : "whitespace-pre-wrap"}
            >
              {entry.line}
            </p>
          {/each}
        {/if}
      </div>

      {#if run.status === "failed" && run.error}
        <p class="text-destructive text-sm">{run.error}</p>
      {/if}
    {:else}
      <div
        class="bg-muted/40 text-muted-foreground flex h-40 items-center justify-center rounded-lg border text-sm"
      >
        <LoaderCircleIcon class="mr-2 size-4 animate-spin" />
        Starting the scrape…
      </div>
    {/if}

    <Dialog.Footer>
      {#if run && !isRunning}
        <Button onclick={runAgain} disabled={!canRunAgain}>Run again</Button>
      {/if}
      <Button variant="outline" onclick={() => (open = false)}>Close</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
