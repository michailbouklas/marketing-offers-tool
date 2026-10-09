<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import type {
    ForecastValidationEvaluateSummary,
    ForecastValidationLastRecord,
  } from "$lib/services/forecasts/forecast-validation.server";
  import CalendarClockIcon from "@lucide/svelte/icons/calendar-clock";
  import PlayIcon from "@lucide/svelte/icons/play";
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  /**
   * Admin controls for forecast validation. Recording runs detached on the
   * server (every brand × model takes a few seconds per brand), so after the
   * 202 the card polls `/api/forecasts/validation/status` until the run has
   * finished, then reloads the page data. Evaluation is synchronous.
   */
  let {
    inFlight,
    lastRecord,
    latestBatch,
    defaultDays,
    cron,
    timezone,
  }: {
    inFlight: { record: boolean; evaluate: boolean };
    lastRecord: ForecastValidationLastRecord | null;
    latestBatch: { batchId: string; cutoffDate: string; runs: number } | null;
    defaultDays: number;
    cron: string;
    timezone: string;
  } = $props();

  const POLL_MS = 3000;
  const RECORD_ENDPOINT = "/api/forecasts/validation/record";
  const EVALUATE_ENDPOINT = "/api/forecasts/validation/evaluate";
  const STATUS_ENDPOINT = "/api/forecasts/validation/status";

  // Initial values on purpose: the card owns its state after the first render
  // and reloads page data itself (invalidateAll) when a run finishes.
  // svelte-ignore state_referenced_locally
  let days = $state(defaultDays);
  // svelte-ignore state_referenced_locally
  let recording = $state(inFlight.record);
  // svelte-ignore state_referenced_locally
  let evaluating = $state(inFlight.evaluate);
  // svelte-ignore state_referenced_locally
  let last = $state<ForecastValidationLastRecord | null>(lastRecord);
  let polling = false;

  type StatusBody = {
    recordInFlight: boolean;
    evaluateInFlight: boolean;
    lastRecord: ForecastValidationLastRecord | null;
  };

  function describeRecord(record: ForecastValidationLastRecord): string {
    if (record.error) {
      return `Recording failed: ${record.error}`;
    }
    if (!record.result) {
      return "Recording in progress…";
    }
    if (record.result.status === "skipped") {
      return `Recording skipped: ${record.result.reason}`;
    }
    const s = record.result.summary;
    return `${s.recorded} recorded, ${s.duplicates} already recorded today, ${s.skipped} skipped, ${s.failed} failed across ${s.brands.length} brands and ${s.models.length} models (${(s.durationMs / 1000).toFixed(0)}s).`;
  }

  async function pollUntilRecorded() {
    if (polling) {
      return;
    }
    polling = true;
    try {
      while (recording) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        const response = await fetch(STATUS_ENDPOINT);
        if (!response.ok) {
          continue;
        }
        const body = (await response.json()) as StatusBody;
        last = body.lastRecord;
        if (!body.recordInFlight) {
          recording = false;
          if (body.lastRecord) {
            const message = describeRecord(body.lastRecord);
            if (body.lastRecord.error) {
              toast.error(message);
            } else {
              toast.success(message);
            }
          }
          await invalidateAll();
        }
      }
    } finally {
      polling = false;
    }
  }

  async function recordNow() {
    recording = true;
    try {
      const response = await fetch(RECORD_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        reason?: string;
        horizonDays?: number;
      };
      if (!response.ok) {
        recording = response.status === 409;
        toast.error(body.reason ?? "Recording could not be started.");
      } else {
        toast.info(
          `Recording ${body.horizonDays ?? days}-day forecasts for every brand and model…`,
        );
      }
      if (recording) {
        await pollUntilRecorded();
      }
    } catch (error) {
      recording = false;
      toast.error(
        error instanceof Error ? error.message : "Recording could not start.",
      );
    }
  }

  async function evaluateNow() {
    evaluating = true;
    try {
      const response = await fetch(EVALUATE_ENDPOINT, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as {
        reason?: string;
        summary?: ForecastValidationEvaluateSummary;
      };
      if (!response.ok || !body.summary) {
        toast.error(body.reason ?? "Evaluation failed.");
        return;
      }
      const s = body.summary;
      toast.success(
        s.due === 0
          ? "No runs are due yet."
          : `${s.evaluated} evaluated, ${s.waiting} still waiting for sales data, ${s.failed} failed.`,
      );
      await invalidateAll();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Evaluation failed.",
      );
    } finally {
      evaluating = false;
    }
  }

  onMount(() => {
    if (recording) {
      void pollUntilRecorded();
    }
  });
</script>

<Card.Root class="border-border/70 bg-background/90 shadow-sm backdrop-blur">
  <Card.Header>
    <div
      class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
    >
      <div class="space-y-1">
        <Card.Title class="text-xl tracking-[-0.03em]">
          Record and evaluate
        </Card.Title>
        <Card.Description>
          Recording stores today's forecast for every brand and model; the sweep
          scores every run whose window has ended. Runs are also scored
          automatically every day (cron <code class="text-xs">{cron}</code>,
          {timezone}).
        </Card.Description>
      </div>
      <div class="flex flex-wrap items-end gap-2">
        <div class="space-y-1">
          <label class="text-muted-foreground text-xs" for="validation-days">
            Window (days)
          </label>
          <Input
            id="validation-days"
            type="number"
            min="1"
            max="90"
            class="w-24"
            bind:value={days}
            disabled={recording}
          />
        </div>
        <Button
          onclick={recordNow}
          disabled={recording ||
            !Number.isInteger(days) ||
            days < 1 ||
            days > 90}
        >
          <PlayIcon class={`size-4 ${recording ? "animate-pulse" : ""}`} />
          {recording ? "Recording…" : "Record forecasts now"}
        </Button>
        <Button variant="outline" onclick={evaluateNow} disabled={evaluating}>
          <RefreshCwIcon class={`size-4 ${evaluating ? "animate-spin" : ""}`} />
          {evaluating ? "Evaluating…" : "Evaluate due runs now"}
        </Button>
      </div>
    </div>
  </Card.Header>
  <Card.Content>
    <dl class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <dt class="text-muted-foreground">Latest batch</dt>
        <dd class="font-medium">
          {#if latestBatch}
            {latestBatch.cutoffDate || "—"}
            <span class="text-muted-foreground text-xs">
              · {latestBatch.runs} runs · {latestBatch.batchId.slice(0, 8)}
            </span>
          {:else}
            None yet
          {/if}
        </dd>
      </div>
      <div>
        <dt class="text-muted-foreground">Last recording from this page</dt>
        <dd class="flex flex-wrap items-center gap-2">
          {#if last}
            <Badge
              variant={last.error
                ? "destructive"
                : recording
                  ? "outline"
                  : "secondary"}
            >
              {last.error ? "failed" : recording ? "running" : "done"}
            </Badge>
            <span class="text-muted-foreground text-xs">
              {new Date(last.startedAt).toLocaleString()} · {last.horizonDays} days
            </span>
          {:else}
            <span class="text-muted-foreground">—</span>
          {/if}
        </dd>
      </div>
      <div class="flex items-start gap-2">
        <CalendarClockIcon
          class="text-muted-foreground mt-0.5 size-4 shrink-0"
        />
        <div>
          <dt class="text-muted-foreground">Command line</dt>
          <dd class="font-mono text-xs">bun run forecast:validate</dd>
        </div>
      </div>
    </dl>
    {#if last && !recording}
      <p class="text-muted-foreground mt-3 text-sm">{describeRecord(last)}</p>
    {/if}
  </Card.Content>
</Card.Root>
