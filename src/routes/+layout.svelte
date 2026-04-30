<script lang="ts">
  import "../app.css";
  import TopNav from "$lib/components/navigation/top-nav.svelte";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  let { children } = $props();
</script>

<div class="bg-background text-foreground min-h-screen">
  <Toaster />
  <TopNav />
  {@render children()}
</div>
