<script lang="ts">
  import { page } from "$app/state";
  import {
    canAccessAdminSection,
    competitionRoles,
    googleReviewsRoles,
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
  import TrendingUpIcon from "@lucide/svelte/icons/trending-up";
  import StarIcon from "@lucide/svelte/icons/star";
  import type { Component } from "svelte";

  // `roles` lists the role(s) that may see the item. Omit it for items visible
  // to everyone. `superUser` is included on capability-gated items since it is
  // the admin-equivalent that holds every resource permission.
  type NavLeaf = {
    href: string;
    label: string;
    icon: Component;
    roles?: UserRole[];
    badge?: number;
  };

  type NavChild = {
    href: string;
    label: string;
    roles?: UserRole[];
  };

  // A group renders as a parent entry with indented sub-items (always
  // expanded). The parent link points at the group's landing page.
  type NavGroup = {
    href: string;
    label: string;
    icon: Component;
    roles?: UserRole[];
    badge?: number;
    children: NavChild[];
  };

  type NavItem = NavLeaf | NavGroup;

  function isGroup(item: NavItem): item is NavGroup {
    return "children" in item;
  }

  const user = $derived(page.data.user as { role?: string } | null | undefined);

  // Unsent offer-notification count for the Competition menu badge, provided by
  // the root layout load.
  const pendingNotificationCount = $derived(
    (page.data.pendingNotificationCount as number | undefined) ?? 0,
  );

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
    {
      href: "/competition",
      label: "Competition",
      icon: TrendingUpIcon,
      roles: competitionRoles,
      children: [
        { href: "/competition", label: "Dashboard" },
        { href: "/competition/offers", label: "Active Offers" },
        {
          href: "/competition/offers/scrape-sessions",
          label: "Scrape Sessions",
          roles: ["superUser"],
        },
        { href: "/competition/restaurants", label: "Restaurants" },
      ],
    },
    {
      href: "/google-reviews",
      label: "Google Reviews",
      icon: StarIcon,
      roles: googleReviewsRoles,
      children: [
        { href: "/google-reviews", label: "Dashboard" },
        { href: "/google-reviews/reviews", label: "Reviews" },
        { href: "/google-reviews/businesses", label: "Businesses" },
      ],
    },
  ];

  const navigationItems = $derived<NavItem[]>([
    ...allNavItems
      .filter((item) => !item.roles || hasAnyRole(user?.role, item.roles))
      .map((item) => {
        const visibleItem = isGroup(item)
          ? {
              ...item,
              children: item.children.filter(
                (child) => !child.roles || hasAnyRole(user?.role, child.roles),
              ),
            }
          : item;

        return visibleItem.href === "/competition" &&
          pendingNotificationCount > 0
          ? { ...visibleItem, badge: pendingNotificationCount }
          : visibleItem;
      }),
    ...(canAccessAdminSection(user?.role)
      ? [{ href: "/admin", label: "Admin", icon: ShieldIcon }]
      : []),
  ]);

  // Sidebar badges hide in icon-collapsed mode; cap the label so a large
  // backlog stays legible.
  function formatBadge(count: number) {
    return count > 99 ? "99+" : String(count);
  }

  function matchesPath(href: string) {
    if (href === "/") {
      return page.url.pathname === href;
    }

    return (
      page.url.pathname === href || page.url.pathname.startsWith(`${href}/`)
    );
  }

  // The longest matching href wins so nested items (e.g. Inspiration under
  // /image-generator, or Restaurants under /competition) don't highlight
  // their parent too. Group children participate alongside top-level hrefs.
  const activeHref = $derived(
    navigationItems
      .flatMap((item) =>
        isGroup(item) ? item.children.map((child) => child.href) : [item.href],
      )
      .filter((href) => matchesPath(href))
      .reduce<string | null>(
        (longest, href) =>
          longest === null || href.length > longest.length ? href : longest,
        null,
      ),
  );

  function isActive(href: string) {
    return href === activeHref;
  }

  function isGroupActive(group: NavGroup) {
    return group.children.some((child) => isActive(child.href));
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
              {#if isGroup(item)}
                <Sidebar.MenuButton
                  isActive={isGroupActive(item)}
                  tooltipContent={item.label}
                >
                  {#snippet child({ props })}
                    <a href={item.href} {...props}>
                      <item.icon />
                      <span>{item.label}</span>
                    </a>
                  {/snippet}
                </Sidebar.MenuButton>
                {#if item.badge}
                  <Sidebar.MenuBadge
                    >{formatBadge(item.badge)}</Sidebar.MenuBadge
                  >
                {/if}
                <Sidebar.MenuSub>
                  {#each item.children as subItem (subItem.href)}
                    <Sidebar.MenuSubItem>
                      <Sidebar.MenuSubButton isActive={isActive(subItem.href)}>
                        {#snippet child({ props })}
                          <a href={subItem.href} {...props}>
                            <span>{subItem.label}</span>
                          </a>
                        {/snippet}
                      </Sidebar.MenuSubButton>
                    </Sidebar.MenuSubItem>
                  {/each}
                </Sidebar.MenuSub>
              {:else}
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
                {#if item.badge}
                  <Sidebar.MenuBadge
                    >{formatBadge(item.badge)}</Sidebar.MenuBadge
                  >
                {/if}
              {/if}
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
