<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import * as Command from "$lib/components/ui/command/index.js";
  import { isGroup, visibleNavItems } from "./nav-items";

  let open = $state(false);

  const user = $derived(page.data.user as { role?: string } | null | undefined);

  // Top-level pages without children share one "Pages" group; each sidebar
  // group (and Admin) becomes its own heading.
  const groups = $derived.by(() => {
    const items = visibleNavItems(user?.role, { adminChildren: true });
    return [
      {
        label: "Pages",
        links: items
          .filter((item) => !isGroup(item))
          .map(({ href, label }) => ({ href, label })),
      },
      ...items.filter(isGroup).map((group) => ({
        label: group.label,
        links: group.children,
      })),
    ].filter((group) => group.links.length > 0);
  });

  function onkeydown(event: KeyboardEvent) {
    if (
      event.key.toLowerCase() === "k" &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey
    ) {
      // Stops the browser focusing its address-bar search.
      event.preventDefault();
      open = !open;
    }
  }

  // Plain substring match on the label; the default fuzzy scorer matched
  // scattered letters (e.g. "live" hit most pages).
  function filter(_value: string, search: string, keywords?: string[]) {
    return keywords?.[0]?.toLowerCase().includes(search.trim().toLowerCase())
      ? 1
      : 0;
  }

  function navigate(href: string) {
    open = false;
    void goto(href);
  }
</script>

<svelte:window {onkeydown} />

<Command.Dialog
  bind:open
  {filter}
  title="Go to page"
  description="Search for a page to open"
>
  <Command.Input placeholder="Search pages…" />
  <Command.List>
    <Command.Empty>No matching pages.</Command.Empty>
    {#each groups as group (group.label)}
      <Command.Group heading={group.label}>
        {#each group.links as link (link.href)}
          <!-- value must be unique (several groups reuse "Dashboard"), so the
               label the filter matches on travels in keywords. -->
          <Command.Item
            value={link.href}
            keywords={[link.label]}
            onSelect={() => navigate(link.href)}
          >
            <span>{link.label}</span>
            <span class="text-muted-foreground ml-auto truncate text-xs"
              >{link.href}</span
            >
          </Command.Item>
        {/each}
      </Command.Group>
    {/each}
  </Command.List>
</Command.Dialog>
