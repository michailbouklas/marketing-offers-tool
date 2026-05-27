<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import TopNav from "$lib/components/navigation/top-nav.svelte";
  import AppSidebar from "$lib/components/navigation/app-sidebar.svelte";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  let { children } = $props();

  const user = $derived(page.data.user as { role?: string } | null | undefined);
</script>

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
