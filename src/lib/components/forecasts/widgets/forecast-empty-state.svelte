<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import InfoIcon from "@lucide/svelte/icons/info";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import type { Snippet } from "svelte";

  /** Same look as `kpi-unavailable-notice.svelte`, with optional actions. */
  let {
    title,
    message,
    tone = "info",
    children,
  }: {
    title: string;
    message: string;
    tone?: "info" | "warning";
    /** Optional actions rendered under the message. */
    children?: Snippet;
  } = $props();
</script>

<Card.Root class="h-full">
  <Card.Content
    class="flex h-full flex-col items-center justify-center gap-3 py-14 text-center"
  >
    <div
      class="flex size-10 items-center justify-center rounded-full {tone ===
      'warning'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : 'bg-muted text-muted-foreground'}"
    >
      {#if tone === "warning"}
        <TriangleAlertIcon class="size-5" />
      {:else}
        <InfoIcon class="size-5" />
      {/if}
    </div>
    <p class="text-lg font-medium">{title}</p>
    <p class="text-muted-foreground max-w-md text-sm leading-6 text-pretty">
      {message}
    </p>
    {#if children}
      <div class="mt-2 flex flex-wrap justify-center gap-2">
        {@render children()}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
