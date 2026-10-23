<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import { ModeWatcher } from "mode-watcher";
  import TopNav from "$lib/components/navigation/top-nav.svelte";
  import AppSidebar from "$lib/components/navigation/app-sidebar.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { scrapeStream } from "$lib/state/scrape-stream.svelte";
  import { presenceReporter } from "$lib/state/presence-reporter";
  import { afterNavigate } from "$app/navigation";
  import { aggregatorStore } from "$lib/state/aggregator.svelte";
  import type { AggregatorValue } from "$lib/services/aggregator-kpis/aggregator-kpis";
  let { children } = $props();

  const user = $derived(page.data.user as { role?: string } | null | undefined);

  // Hydrate the global Foody/Wolt choice from the cookie-backed server data so
  // the KPI filter-bar toggle reflects the persisted platform on every page.
  $effect(() => {
    aggregatorStore.hydrate(
      page.data.aggregator as AggregatorValue | null | undefined,
    );
  });

  // Reconnect to an in-flight scrape (started elsewhere or before a reload) so
  // the "Scrape completed" toast fires from any page. `init()` is idempotent and
  // browser-only; the store ignores callers without scrape access (403s are
  // swallowed as best-effort status).
  $effect(() => {
    if (user) {
      void scrapeStream.init();
    }
  });

  // Live monitoring: report this tab's current page so superUsers can see it on
  // /admin/live-monitoring. Stops (and announces "leave") on sign-out.
  // Keyed on the id (a primitive) so a re-run of the root load that returns a
  // fresh `user` object doesn't churn the tab id.
  const presenceUserId = $derived(
    (page.data.user as { id?: string } | null | undefined)?.id ?? null,
  );

  $effect(() => {
    if (!presenceUserId) {
      return;
    }
    presenceReporter.init();
    return () => presenceReporter.destroy();
  });

  afterNavigate(() => presenceReporter.beat(page.route.id));
</script>

<ModeWatcher />
<Toaster />
{#if user}
  <Sidebar.Provider>
    <AppSidebar />
    <Sidebar.Inset class="min-w-0">
      <TopNav />
      {@render children()}
    </Sidebar.Inset>
  </Sidebar.Provider>
{:else}
  {@render children()}
{/if}
