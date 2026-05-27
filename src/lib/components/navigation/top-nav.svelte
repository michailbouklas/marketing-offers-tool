<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";

  // NOTE: The horizontal navigation menu was moved to a vertical left
  // sidebar (see app-sidebar.svelte) because the header ran out of space.
  // The previous header-based menu is preserved (commented out) below in
  // case we want to revert.
</script>

<header
  class="border-border/70 bg-background/82 sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-xl"
>
  <Sidebar.Trigger />

  <Badge variant="outline" class="ml-auto hidden sm:inline-flex">
    Authenticated
  </Badge>
</header>

<!--
  Previous header navigation (moved to the left sidebar):

  <script lang="ts">
    import { page } from "$app/state";
    import SignOutButton from "$lib/components/ui/sign-out-button/index.svelte";
    import { Badge } from "$lib/components/ui/badge/index.js";
    import { Button } from "$lib/components/ui/button/index.js";

    const user = $derived(page.data.user as { role?: string } | null | undefined);
    const navigationItems = $derived([
      { href: "/", label: "Home" },
      { href: "/aggregator-offers", label: "Aggregator Offers" },
      { href: "/offers-data-quality", label: "Data Quality" },
      { href: "/image-generator", label: "Image Generator" },
      ...(user?.role === "admin"
        ? [
            { href: "/admin/pending-submissions", label: "Pending submissions" },
            { href: "/admin/dim-offers", label: "Dim offers" },
            { href: "/admin/users", label: "Users" },
          ]
        : []),
    ]);

    function isActive(href: string) {
      if (href === "/") {
        return page.url.pathname === href;
      }

      return (
        page.url.pathname === href || page.url.pathname.startsWith(`${href}/`)
      );
    }
  </script>

  <header class="border-border/70 bg-background/82 sticky top-0 z-40 border-b backdrop-blur-xl">
    <div class="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
      <div class="flex items-center justify-between gap-3">
        <a href="/" class="flex items-center gap-3">
          <div class="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-2xl text-sm font-semibold tracking-[0.16em] uppercase shadow-sm">
            MT
          </div>
          <div class="space-y-0.5">
            <p class="text-sm font-semibold tracking-[-0.02em]">Marketing Tools</p>
            <p class="text-muted-foreground text-xs">Internal operations workspace</p>
          </div>
        </a>

        <Badge variant="outline" class="hidden sm:inline-flex">Authenticated</Badge>
      </div>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
        <nav class="flex flex-wrap items-center gap-2">
          {#each navigationItems as item (item.href)}
            <Button href={item.href} variant={isActive(item.href) ? "default" : "ghost"} size="sm">
              {item.label}
            </Button>
          {/each}
        </nav>

        <SignOutButton class="w-full sm:w-auto" />
      </div>
    </div>
  </header>
-->
