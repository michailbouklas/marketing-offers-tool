<script lang="ts">
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "$lib/components/ui/alert/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Card, CardContent } from "$lib/components/ui/card/index.js";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import XIcon from "@lucide/svelte/icons/x";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import { toast } from "svelte-sonner";
  import {
    COMPLIANCE_STEP_LABELS,
    formatComplianceMarkdown,
    formatElapsed,
  } from "$lib/services/image-compliance/image-compliance";
  import type { ImageEntry } from "./compliance-types";

  interface Props {
    entry: ImageEntry;
    /** Shared ticker from the page; only advances while something runs. */
    now: number;
    /** Brand the check ran against; included in the copied markdown. */
    brandName?: string | null;
    onRemove?: (id: string) => void;
    onRetry?: (id: string) => void;
  }

  let { entry, now, brandName = null, onRemove, onRetry }: Props = $props();

  let copied = $state(false);
  let copiedTimer: ReturnType<typeof setTimeout> | null = null;

  async function copyResult() {
    if (!entry.result) return;
    const markdown = formatComplianceMarkdown({
      fileName: entry.file.name,
      brandName,
      result: entry.result,
      durationMs: elapsedMs,
    });
    try {
      await navigator.clipboard.writeText(markdown);
      copied = true;
      if (copiedTimer) clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      toast.error("Could not copy to the clipboard.");
    }
  }

  const elapsedMs = $derived(
    entry.startedAt === null ? 0 : (entry.finishedAt ?? now) - entry.startedAt,
  );
  const stepLabel = $derived(
    entry.step ? COMPLIANCE_STEP_LABELS[entry.step] : "Starting…",
  );
</script>

<Card class="overflow-hidden">
  <CardContent class="space-y-3">
    <div
      class="bg-muted relative aspect-square w-full overflow-hidden rounded-md"
    >
      <img
        src={entry.objectUrl}
        alt={entry.file.name}
        class="h-full w-full object-contain"
      />
      {#if entry.status === "running"}
        <div
          class="bg-background/80 absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm"
          aria-live="polite"
        >
          <LoaderCircleIcon class="size-7 animate-spin" />
          <span class="font-medium">{stepLabel}</span>
          <span class="text-muted-foreground font-mono text-xs"
            >{formatElapsed(elapsedMs)}</span
          >
        </div>
      {:else if entry.status === "queued" && onRemove}
        <Button
          size="icon"
          variant="secondary"
          class="absolute top-2 right-2"
          aria-label="Remove image"
          onclick={() => onRemove(entry.id)}
        >
          <XIcon />
        </Button>
      {/if}
    </div>

    <div class="flex items-start justify-between gap-2">
      <p class="truncate text-sm font-medium" title={entry.file.name}>
        {entry.file.name}
      </p>
      {#if entry.status === "queued"}
        <Badge variant="secondary">Queued</Badge>
      {:else if entry.status === "running"}
        <Badge variant="secondary">Checking</Badge>
      {:else if entry.status === "cancelled"}
        <Badge variant="outline">Cancelled</Badge>
      {:else if entry.status === "error"}
        <Badge variant="destructive">Failed</Badge>
      {:else if entry.result?.compliant}
        <Badge class="bg-emerald-600 text-white hover:bg-emerald-600">
          <CircleCheckIcon />
          Compliant
        </Badge>
      {:else}
        <Badge variant="destructive">Not compliant</Badge>
      {/if}
    </div>

    {#if entry.status === "done" && entry.result}
      <div class="space-y-3 text-sm">
        {#if entry.result.summary}
          <p class="text-muted-foreground">{entry.result.summary}</p>
        {/if}
        {#if entry.result.reasons.length > 0}
          <div class="space-y-1">
            <p class="font-medium">Findings</p>
            <ul class="list-disc space-y-1 pl-5">
              {#each entry.result.reasons as reason, index (index)}
                <li>{reason}</li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if entry.result.suggestions.length > 0}
          <div class="space-y-1">
            <p class="font-medium">Suggestions</p>
            <ul class="list-disc space-y-1 pl-5">
              {#each entry.result.suggestions as suggestion, index (index)}
                <li>{suggestion}</li>
              {/each}
            </ul>
          </div>
        {/if}
        <div class="flex items-center justify-between gap-2">
          <p class="text-muted-foreground font-mono text-xs">
            {formatElapsed(elapsedMs)}
          </p>
          <Button
            variant="outline"
            size="sm"
            type="button"
            aria-label="Copy result as markdown"
            onclick={copyResult}
          >
            {#if copied}
              <CheckIcon />
              Copied
            {:else}
              <CopyIcon />
              Copy
            {/if}
          </Button>
        </div>
      </div>
    {:else if entry.status === "error"}
      <div class="space-y-2">
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Check failed</AlertTitle>
          <AlertDescription>
            {entry.error ?? "Unknown error"}
          </AlertDescription>
        </Alert>
        {#if onRetry}
          <Button
            variant="outline"
            size="sm"
            type="button"
            onclick={() => onRetry(entry.id)}
          >
            <RotateCcwIcon />
            Retry
          </Button>
        {/if}
      </div>
    {:else if entry.status === "cancelled"}
      <div class="space-y-2">
        <p class="text-muted-foreground text-sm">
          Cancelled after {formatElapsed(elapsedMs)}.
        </p>
        {#if onRetry}
          <Button
            variant="outline"
            size="sm"
            type="button"
            onclick={() => onRetry(entry.id)}
          >
            <RotateCcwIcon />
            Check again
          </Button>
        {/if}
      </div>
    {/if}
  </CardContent>
</Card>
