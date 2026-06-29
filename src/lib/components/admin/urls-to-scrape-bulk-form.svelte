<script lang="ts">
  import XIcon from "@lucide/svelte/icons/x";
  import { enhance } from "$app/forms";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as NativeSelect from "$lib/components/ui/native-select/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import {
    aggregatorLabel,
    aggregatorOptions,
    type BulkUrlToScrapeItem,
    detectAggregator,
    parseBulkUrlInput,
  } from "$lib/services/urls-to-scrape-form";

  type Props = {
    onSuccess?: (added: number, skipped: number) => void;
  };

  let { onSuccess }: Props = $props();

  let step = $state<"input" | "preview">("input");
  let rawText = $state("");
  let rows = $state<BulkUrlToScrapeItem[]>([]);
  let skipped = $state(0);
  let parseError = $state<string | null>(null);
  let submitting = $state(false);

  const hasMissingAggregator = $derived(
    rows.some((row) => row.aggregator === ""),
  );

  function resetState() {
    step = "input";
    rawText = "";
    rows = [];
    skipped = 0;
    parseError = null;
  }

  function parse() {
    const result = parseBulkUrlInput(rawText);
    if (result.urls.length === 0) {
      parseError =
        "No valid URLs found. Paste a JSON array or one URL per line.";
      return;
    }
    parseError = null;
    skipped = result.skipped;
    rows = result.urls.map((url) => ({
      url,
      aggregator: detectAggregator(url),
    }));
    step = "preview";
  }

  function removeRow(index: number) {
    rows = rows.filter((_, i) => i !== index);
    if (rows.length === 0) {
      resetState();
    }
  }
</script>

{#if step === "input"}
  <div class="space-y-4">
    <div class="space-y-2">
      <Label for="bulk-urls">URLs</Label>
      <Textarea
        id="bulk-urls"
        rows={10}
        class="max-h-[50vh] overflow-y-auto"
        placeholder={"Paste a JSON array or one URL per line, e.g.\nhttps://www.foody.com.cy/delivery/menu/costa-coffee"}
        bind:value={rawText}
      />
      <p class="text-muted-foreground text-xs">
        Accepts a JSON array of URLs or a newline-separated list. URLs are
        trimmed; invalid or duplicate lines are skipped.
      </p>
      {#if parseError}
        <p class="text-destructive text-sm">{parseError}</p>
      {/if}
    </div>

    <div class="flex justify-end">
      <Button type="button" onclick={parse} disabled={rawText.trim() === ""}>
        Parse
      </Button>
    </div>
  </div>
{:else}
  <form
    method="POST"
    action="?/bulkCreateUrls"
    use:enhance={() => {
      submitting = true;
      return async ({ result, update }) => {
        submitting = false;
        if (result.type === "success") {
          const added = (result.data?.bulkAdded as number | undefined) ?? 0;
          const skipped = (result.data?.bulkSkipped as number | undefined) ?? 0;
          resetState();
          onSuccess?.(added, skipped);
        }
        await update();
      };
    }}
    class="flex min-h-0 flex-1 flex-col gap-4"
  >
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm font-medium">
        {rows.length} URL{rows.length === 1 ? "" : "s"} to add
      </p>
      {#if skipped > 0}
        <p class="text-muted-foreground text-xs">
          {skipped} invalid/duplicate line{skipped === 1 ? "" : "s"} skipped
        </p>
      {/if}
    </div>

    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
      {#each rows as row, index (row.url)}
        <div
          class="border-border flex items-center gap-2 rounded-lg border px-3 py-2"
        >
          <span class="flex-1 text-sm break-all">{row.url}</span>
          <NativeSelect.Root
            class="w-36 shrink-0"
            aria-label="Aggregator"
            bind:value={rows[index].aggregator}
          >
            <NativeSelect.Option value="">Select</NativeSelect.Option>
            {#each aggregatorOptions as option}
              <NativeSelect.Option value={option}>
                {aggregatorLabel(option)}
              </NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="shrink-0"
            aria-label="Remove URL"
            onclick={() => removeRow(index)}
          >
            <XIcon class="size-4" />
          </Button>
        </div>
      {/each}
    </div>

    {#if hasMissingAggregator}
      <p class="text-destructive text-sm">
        Select an aggregator for every URL before adding.
      </p>
    {/if}

    <input type="hidden" name="payload" value={JSON.stringify(rows)} />

    <div class="flex justify-between gap-3">
      <Button
        type="button"
        variant="outline"
        onclick={() => (step = "input")}
        disabled={submitting}
      >
        Back
      </Button>
      <Button type="submit" disabled={submitting || hasMissingAggregator}>
        {submitting ? "Adding..." : `Add ${rows.length} URLs`}
      </Button>
    </div>
  </form>
{/if}
