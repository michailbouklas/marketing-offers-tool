<script lang="ts">
  import { page } from "$app/state";
  import {
    canAccessAdminSection,
    hasAnyRole,
    type UserRole,
  } from "$lib/auth/roles";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import SignOutButton from "$lib/components/ui/sign-out-button/index.svelte";
  import HouseIcon from "@lucide/svelte/icons/house";
  import StoreIcon from "@lucide/svelte/icons/store";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import ImageIcon from "@lucide/svelte/icons/image";
  import PenLineIcon from "@lucide/svelte/icons/pen-line";
  import LightbulbIcon from "@lucide/svelte/icons/lightbulb";
  import ShieldIcon from "@lucide/svelte/icons/shield";
  import type { Component } from "svelte";

  // `roles` lists the role(s) that may see the item. Omit it for items visible
  // to everyone. `superUser` is included on capability-gated items since it is
  // the admin-equivalent that holds every resource permission.
  type NavItem = {
    href: string;
    label: string;
    icon: Component;
    roles?: UserRole[];
  };

  const user = $derived(page.data.user as { role?: string } | null | undefined);

  const allNavItems: NavItem[] = [
    { href: "/", label: "Home", icon: HouseIcon },
    {
      href: "/aggregator-offers",
      label: "Aggregator Offers",
      icon: StoreIcon,
      roles: ["offerEditor", "superUser"],
    },
    {
      href: "/offers-data-quality",
      label: "Data Quality",
      icon: ShieldCheckIcon,
      roles: ["offerEditor", "superUser"],
    },
    {
      href: "/image-generator",
      label: "Image Generator",
      icon: ImageIcon,
      roles: ["admin", "superUser", "brandManager", "imageEditor"],
    },
    {
      href: "/image-generator/inspiration",
      label: "Inspiration",
      icon: LightbulbIcon,
      roles: ["admin", "superUser", "brandManager", "imageEditor"],
    },
    {
      href: "/copywriter",
      label: "Copywriter",
      icon: PenLineIcon,
      roles: ["superUser", "copywriter"],
    },
  ];

  const navigationItems = $derived<NavItem[]>([
    ...allNavItems.filter(
      (item) => !item.roles || hasAnyRole(user?.role, item.roles),
    ),
    ...(canAccessAdminSection(user?.role)
      ? [{ href: "/admin", label: "Admin", icon: ShieldIcon }]
      : []),
  ]);

  function matchesPath(href: string) {
    if (href === "/") {
      return page.url.pathname === href;
    }

    return (
      page.url.pathname === href || page.url.pathname.startsWith(`${href}/`)
    );
  }

  // The longest matching href wins so nested items (e.g. Inspiration under
  // /image-generator) don't highlight their parent too.
  const activeHref = $derived(
    navigationItems
      .filter((item) => matchesPath(item.href))
      .reduce<
        string | null
      >((longest, item) => (longest === null || item.href.length > longest.length ? item.href : longest), null),
  );

  function isActive(href: string) {
    return href === activeHref;
  }
</script>

<Sidebar.Root collapsible="icon">
  <Sidebar.Header>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton size="lg">
          {#snippet child({ props })}
            <a href="/" {...props}>
              <div
                class="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg text-xs font-semibold tracking-[0.16em] uppercase"
              >
                MT
              </div>
              <div class="grid flex-1 text-left leading-tight">
                <span class="truncate font-semibold tracking-[-0.02em]"
                  >Marketing Tools</span
                >
                <span class="text-muted-foreground truncate text-xs"
                  >Internal workspace</span
                >
              </div>
            </a>
          {/snippet}
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          {#each navigationItems as item (item.href)}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                isActive={isActive(item.href)}
                tooltipContent={item.label}
              >
                {#snippet child({ props })}
                  <a href={item.href} {...props}>
                    <item.icon />
                    <span>{item.label}</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Footer>
    <SignOutButton class="w-full" />
  </Sidebar.Footer>

  <Sidebar.Rail />
</Sidebar.Root>
