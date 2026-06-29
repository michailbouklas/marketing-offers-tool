<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import { ModeWatcher } from "mode-watcher";
  import TopNav from "$lib/components/navigation/top-nav.svelte";
  import AppSidebar from "$lib/components/navigation/app-sidebar.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { scrapeStream } from "$lib/state/scrape-stream.svelte";
  let { children } = $props();

  const user = $derived(page.data.user as { role?: string } | null | undefined);

  // Reconnect to an in-flight scrape (started elsewhere or before a reload) so
  // the "Scrape completed" toast fires from any page. `init()` is idempotent and
  // browser-only; the store ignores callers without scrape access (403s are
  // swallowed as best-effort status).
  $effect(() => {
    if (user) {
      void scrapeStream.init();
    }
  });
</script>

<ModeWatcher />
<Toaster />
{#if user}
  <Sidebar.Provider>
    <AppSidebar />
    <Sidebar.Inset>
      <TopNav />
      {@render children()}
    </Sidebar.Inset>
  </Sidebar.Provider>
{:else}
  {@render children()}
{/if}
