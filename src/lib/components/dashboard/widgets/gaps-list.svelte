<script lang="ts">
  import type { GapsWidgetData } from "$lib/dashboard/widgets";

  let { data, empty }: { data: GapsWidgetData; empty: string } = $props();
</script>

<p class="text-2xl font-semibold tabular-nums">{data.total}</p>
{#if data.items.length === 0}
  <p class="text-muted-foreground text-sm">{empty}</p>
{:else}
  <ul class="divide-y text-sm">
    {#each data.items as gap (gap.trde_item)}
      <li>
        <a
          href={gap.dq_id > 0
            ? `/offers-data-quality/${gap.dq_id}`
            : `/offers-data-quality/open/${gap.trde_item}`}
          class="hover:bg-muted/50 flex items-center justify-between gap-3 rounded px-1 py-1.5"
        >
          <span class="truncate">{gap.item_name}</span>
          <span class="text-muted-foreground shrink-0 text-xs uppercase">
            {gap.brand}
          </span>
        </a>
      </li>
    {/each}
  </ul>
{/if}
