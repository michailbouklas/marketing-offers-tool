<script lang="ts">
  import { page } from "$app/state";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import SignOutButton from "$lib/components/ui/sign-out-button/index.svelte";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import { slide } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";
  import {
    isGroup,
    visibleNavItems,
    type NavGroup,
    type NavItem,
  } from "./nav-items";

  const user = $derived(page.data.user as { role?: string } | null | undefined);

  // Unsent offer-notification count for the Competition menu badge, provided by
  // the root layout load.
  const pendingNotificationCount = $derived(
    (page.data.pendingNotificationCount as number | undefined) ?? 0,
  );

  const navigationItems = $derived<NavItem[]>(
    visibleNavItems(user?.role).map((item) =>
      item.href === "/competition" && pendingNotificationCount > 0
        ? { ...item, badge: pendingNotificationCount }
        : item,
    ),
  );

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

  // Explicit user toggles; untouched groups follow the route (open when active).
  let openGroups = $state<Record<string, boolean>>({});

  function isGroupOpen(group: NavGroup) {
    return openGroups[group.href] ?? isGroupActive(group);
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
                {@const open = isGroupOpen(item)}
                <Collapsible.Root
                  {open}
                  onOpenChange={(value) => (openGroups[item.href] = value)}
                >
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
                  <Collapsible.Trigger>
                    {#snippet child({ props })}
                      <Sidebar.MenuAction
                        {...props}
                        aria-label={`${open ? "Collapse" : "Expand"} ${item.label}`}
                        class={open ? "rotate-90" : ""}
                      >
                        <ChevronRightIcon />
                      </Sidebar.MenuAction>
                    {/snippet}
                  </Collapsible.Trigger>
                  {#if item.badge}
                    <!-- right-7 keeps the badge clear of the chevron -->
                    <Sidebar.MenuBadge class="right-7"
                      >{formatBadge(item.badge)}</Sidebar.MenuBadge
                    >
                  {/if}
                  <Collapsible.Content forceMount>
                    {#snippet child({ props, open: contentOpen })}
                      {#if contentOpen}
                        <div
                          {...props}
                          transition:slide={{
                            duration: prefersReducedMotion.current ? 0 : 200,
                          }}
                        >
                          <Sidebar.MenuSub>
                            {#each item.children as subItem (subItem.href)}
                              <Sidebar.MenuSubItem>
                                <Sidebar.MenuSubButton
                                  isActive={isActive(subItem.href)}
                                >
                                  {#snippet child({ props })}
                                    <a href={subItem.href} {...props}>
                                      <span>{subItem.label}</span>
                                    </a>
                                  {/snippet}
                                </Sidebar.MenuSubButton>
                              </Sidebar.MenuSubItem>
                            {/each}
                          </Sidebar.MenuSub>
                        </div>
                      {/if}
                    {/snippet}
                  </Collapsible.Content>
                </Collapsible.Root>
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
