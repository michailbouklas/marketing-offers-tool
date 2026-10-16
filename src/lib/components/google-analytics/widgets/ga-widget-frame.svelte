<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import {
    formatRelativeAge,
    type GoogleAnalyticsWidgetState,
  } from "$lib/services/google-analytics/google-analytics";
  import HourglassIcon from "@lucide/svelte/icons/hourglass";
  import type { Snippet } from "svelte";

  /**
   * Wraps one dashboard widget with its cache provenance: a fresh widget
   * renders untouched, a stale one gets an "updated … ago" note, and a
   * pending one (no cached copy, Google refused, retry queued) is replaced by
   * a placeholder card so the rest of the page still works.
   */
  let {
    state,
    title,
    description = "Google refused this report (quota). It is queued and will appear automatically.",
    retryHint = null,
    class: className = "",
    children,
  }: {
    state: GoogleAnalyticsWidgetState;
    /** Shown on the pending placeholder so the user knows what is missing. */
    title: string;
    description?: string;
    /** e.g. "next retry 14:05" from the status poll. */
    retryHint?: string | null;
    class?: string;
    children: Snippet;
  } = $props();
</script>

{#if state.status === "pending"}
  <Card.Root class={className} aria-busy="true">
    <Card.Header class="pb-2">
      <Card.Description class="flex items-center gap-2">
        <HourglassIcon class="size-4" aria-hidden="true" />
        Waiting for Google Analytics
      </Card.Description>
      <Card.Title class="text-base">{title}</Card.Title>
    </Card.Header>
    <Card.Content class="space-y-3">
      <Skeleton class="h-20 w-full rounded-xl" />
      <div class="space-y-2">
        <Skeleton class="h-4 w-2/3" />
        <Skeleton class="h-4 w-1/2" />
      </div>
      <p class="text-muted-foreground text-sm">
        {description}
        {#if retryHint}
          <span class="tabular-nums">{retryHint}.</span>
        {/if}
      </p>
      <p class="text-muted-foreground/80 text-xs leading-5">{state.reason}</p>
    </Card.Content>
  </Card.Root>
{:else}
  <div class={["space-y-1", className]}>
    {@render children()}
    {#if state.status === "stale"}
      <p class="text-muted-foreground px-1 text-xs tabular-nums">
        Showing data fetched {formatRelativeAge(state.fetchedAt)} · Google refused
        the refresh, retry queued{retryHint ? ` (${retryHint})` : ""}.
      </p>
    {/if}
  </div>
{/if}
