<script lang="ts">
  import {
    groupPresenceTabs,
    type PresenceSnapshot,
    type PresenceTab,
  } from "$lib/services/presence/presence";

  let tabs = $state<PresenceTab[]>([]);
  let live = $state(false);

  // Same feed as /admin/live-monitoring (superUser-guarded on the server).
  $effect(() => {
    const source = new EventSource("/api/admin/live-monitoring/stream");
    source.addEventListener("snapshot", (e) => {
      try {
        tabs = (JSON.parse((e as MessageEvent).data) as PresenceSnapshot).tabs;
        live = true;
      } catch {
        // Keep the last good snapshot.
      }
    });
    source.addEventListener("error", () => {
      live = false;
    });
    return () => source.close();
  });

  const groups = $derived(groupPresenceTabs(tabs));
</script>

<p class="text-muted-foreground mb-2 flex items-center gap-2 text-xs">
  <span
    class={[
      "size-2 rounded-full",
      live ? "animate-pulse bg-emerald-500" : "bg-amber-500",
    ]}
  ></span>
  {live
    ? `${groups.length} ${groups.length === 1 ? "user" : "users"} online`
    : "Connecting…"}
</p>
<ul class="divide-border/70 max-h-80 divide-y overflow-y-auto">
  {#each groups as group (group.userId)}
    <li class="py-2">
      <p class="flex items-center gap-2 text-sm font-medium">
        <span
          class={[
            "size-2 shrink-0 rounded-full",
            group.anyVisible ? "bg-emerald-500" : "bg-zinc-400",
          ]}
          title={group.anyVisible ? "Active" : "All tabs in background"}
        ></span>
        <span class="truncate">{group.name}</span>
      </p>
      {#each group.tabs as tab (tab.tabId)}
        <a
          href={tab.path}
          title={tab.path}
          class={[
            "block truncate pl-4 text-xs hover:underline",
            tab.visible ? "text-foreground" : "text-muted-foreground",
          ]}
        >
          {tab.title || tab.path}
        </a>
      {/each}
    </li>
  {:else}
    {#if live}
      <li class="text-muted-foreground py-2 text-sm">No one online.</li>
    {/if}
  {/each}
</ul>
