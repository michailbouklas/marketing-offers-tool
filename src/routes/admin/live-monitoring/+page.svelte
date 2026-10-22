<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { parseRoles, roleLabels } from "$lib/auth/roles";
  import type {
    PresenceSnapshot,
    PresenceTab,
  } from "$lib/services/presence/presence";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import EyeOffIcon from "@lucide/svelte/icons/eye-off";
  import RadioIcon from "@lucide/svelte/icons/radio";

  type ConnectionStatus = "connecting" | "live" | "reconnecting";

  type UserGroup = {
    userId: string;
    name: string;
    email: string;
    role: string | null;
    tabs: PresenceTab[];
    anyVisible: boolean;
  };

  let tabs = $state<PresenceTab[]>([]);
  let status = $state<ConnectionStatus>("connecting");
  /** Ticks every 10 s so relative times re-render without new data. */
  let now = $state(Date.now());

  $effect(() => {
    const source = new EventSource("/api/admin/live-monitoring/stream");

    source.addEventListener("snapshot", (e) => {
      try {
        const snapshot = JSON.parse(
          (e as MessageEvent).data,
        ) as PresenceSnapshot;
        tabs = snapshot.tabs;
        status = "live";
      } catch {
        // Keep the last good snapshot.
      }
    });

    // The browser reconnects automatically; the next snapshot is complete.
    source.addEventListener("error", () => {
      status = "reconnecting";
    });

    const ticker = setInterval(() => {
      now = Date.now();
    }, 10_000);

    return () => {
      source.close();
      clearInterval(ticker);
    };
  });

  const groups = $derived.by<UserGroup[]>(() => {
    const byUser = new Map<string, UserGroup>();
    for (const tab of tabs) {
      let group = byUser.get(tab.userId);
      if (!group) {
        group = {
          userId: tab.userId,
          name: tab.name,
          email: tab.email,
          role: tab.role,
          tabs: [],
          anyVisible: false,
        };
        byUser.set(tab.userId, group);
      }
      group.tabs.push(tab);
      group.anyVisible ||= tab.visible;
    }

    for (const group of byUser.values()) {
      // Foreground tab first, then most recently navigated.
      group.tabs.sort(
        (a, b) =>
          Number(b.visible) - Number(a.visible) ||
          b.pathSince.localeCompare(a.pathSince),
      );
    }

    return [...byUser.values()].sort(
      (a, b) =>
        Number(b.anyVisible) - Number(a.anyVisible) ||
        a.name.localeCompare(b.name),
    );
  });

  const activeUserCount = $derived(
    groups.filter((group) => group.anyVisible).length,
  );

  function formatRelative(iso: string): string {
    const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
    if (seconds < 60) {
      return "<1 min";
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours} h ${minutes % 60} min`;
  }

  function formatRoles(role: string | null): string {
    const parsed = parseRoles(role);
    return parsed.length > 0
      ? parsed.map((r) => roleLabels[r]).join(", ")
      : "No role";
  }

  const statusLabel: Record<ConnectionStatus, string> = {
    connecting: "Connecting…",
    live: "Live",
    reconnecting: "Reconnecting…",
  };
</script>

<svelte:head>
  <title>Live monitoring | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Real-time view of signed-in users and the pages their open tabs are viewing."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>

  <main
    class="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
  >
    <section
      class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div class="space-y-2">
        <p
          class="text-sm font-semibold tracking-[0.18em] text-zinc-500 uppercase"
        >
          Admin workspace
        </p>
        <h1 class="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Live monitoring
        </h1>
        <p class="text-muted-foreground max-w-2xl text-base leading-7">
          Who has the tool open right now, and which page each of their tabs is
          on. Closed tabs disappear immediately; a crashed browser drops off
          within 90 seconds.
        </p>
      </div>

      <Button href="/admin" variant="outline">
        <ArrowLeftIcon class="size-4" />
        Back to admin
      </Button>
    </section>

    <section class="flex flex-wrap items-center gap-3 text-sm">
      <span class="inline-flex items-center gap-2 font-medium">
        <span
          class={[
            "size-2.5 rounded-full",
            status === "live" ? "animate-pulse bg-emerald-500" : "bg-amber-500",
          ]}
        ></span>
        {statusLabel[status]}
      </span>
      <span class="text-muted-foreground">·</span>
      <span>
        <strong>{groups.length}</strong>
        {groups.length === 1 ? "user" : "users"} online
      </span>
      <span class="text-muted-foreground">·</span>
      <span><strong>{activeUserCount}</strong> active now</span>
      <span class="text-muted-foreground">·</span>
      <span>
        <strong>{tabs.length}</strong>
        {tabs.length === 1 ? "tab" : "tabs"}
      </span>
    </section>

    <section class="grid gap-4 lg:grid-cols-2">
      {#each groups as group (group.userId)}
        <Card.Root class="border-border/70">
          <Card.Header>
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-1">
                <Card.Title class="flex items-center gap-2 text-lg">
                  <span
                    class={[
                      "size-2 shrink-0 rounded-full",
                      group.anyVisible ? "bg-emerald-500" : "bg-zinc-400",
                    ]}
                    title={group.anyVisible
                      ? "Active"
                      : "All tabs in background"}
                  ></span>
                  <span class="truncate">{group.name}</span>
                </Card.Title>
                <Card.Description class="truncate">
                  {group.email}
                </Card.Description>
              </div>
              <div class="flex shrink-0 flex-col items-end gap-1">
                <Badge variant="secondary">{formatRoles(group.role)}</Badge>
                <span class="text-muted-foreground text-xs">
                  {group.tabs.length}
                  {group.tabs.length === 1 ? "tab" : "tabs"}
                </span>
              </div>
            </div>
          </Card.Header>
          <Card.Content>
            <ul class="divide-border/70 divide-y">
              {#each group.tabs as tab (tab.tabId)}
                <li class="flex items-start justify-between gap-3 py-2.5">
                  <div class="min-w-0 space-y-0.5">
                    <p class="truncate text-sm font-medium">
                      {tab.title || tab.path}
                    </p>
                    <a
                      href={tab.path}
                      class="text-muted-foreground hover:text-foreground block truncate font-mono text-xs hover:underline"
                    >
                      {tab.path}
                    </a>
                  </div>
                  <div
                    class="text-muted-foreground flex shrink-0 flex-col items-end gap-1 text-xs"
                  >
                    {#if !tab.visible}
                      <Badge variant="outline" class="gap-1">
                        <EyeOffIcon class="size-3" />
                        Background
                      </Badge>
                    {/if}
                    <span title={new Date(tab.pathSince).toLocaleString()}>
                      on page for {formatRelative(tab.pathSince)}
                    </span>
                  </div>
                </li>
              {/each}
            </ul>
          </Card.Content>
        </Card.Root>
      {:else}
        <Card.Root class="border-border/70 lg:col-span-2">
          <Card.Content
            class="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm"
          >
            <RadioIcon class="size-6" />
            {status === "live"
              ? "No open tabs reported yet."
              : "Waiting for the live feed…"}
          </Card.Content>
        </Card.Root>
      {/each}
    </section>
  </main>
</div>
