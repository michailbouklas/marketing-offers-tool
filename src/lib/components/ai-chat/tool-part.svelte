<script lang="ts">
  import {
    isSqlToolPart,
    toolErrorText,
    toolLabel,
    toolPending,
    toolSql,
  } from "$lib/components/ai-chat/tool-part";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import DatabaseIcon from "@lucide/svelte/icons/database";
  import WrenchIcon from "@lucide/svelte/icons/wrench";

  let { part }: { part: unknown } = $props();

  let expanded = $state(false);

  const type = $derived((part as { type: string }).type);
  const sql = $derived(isSqlToolPart(type) ? toolSql(part) : null);
  const errorText = $derived(toolErrorText(part));
  const pending = $derived(toolPending(part));
  const label = $derived(toolLabel(type, part));
</script>

{#if isSqlToolPart(type)}
  {#if sql}
    <button
      type="button"
      class="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 text-xs"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <DatabaseIcon class="size-3" />
      {label}
      {#if expanded}
        <ChevronDownIcon class="size-3" />
      {:else}
        <ChevronRightIcon class="size-3" />
      {/if}
    </button>
    {#if expanded}
      <pre
        class="bg-muted mt-1 max-h-64 overflow-auto rounded-md border p-2"><code
          class="font-mono text-xs whitespace-pre-wrap">{sql}</code
        ></pre>
    {/if}
  {:else}
    <p
      class={[
        "text-muted-foreground flex items-center gap-1.5 text-xs",
        pending ? "animate-pulse" : "",
      ].join(" ")}
    >
      <DatabaseIcon class="size-3" />
      {label}
    </p>
  {/if}
  {#if errorText}
    <p class="text-destructive text-xs">Query failed: {errorText}</p>
  {/if}
{:else}
  <p
    class={[
      "text-muted-foreground flex items-center gap-1.5 text-xs",
      pending ? "animate-pulse" : "",
    ].join(" ")}
  >
    <WrenchIcon class="size-3" />
    {label}
  </p>
{/if}
