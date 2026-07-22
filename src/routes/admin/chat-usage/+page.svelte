<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { agentLabel } from "$lib/services/chat-usage";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const overview = $derived(data.overview);
  const perAgent = $derived(overview.perAgent);
  const perUser = $derived(overview.perUser);

  const topUsersInWidget = 5;
  const widgetUsers = $derived(perUser.slice(0, topUsersInWidget));
  const remainingUsers = $derived(
    Math.max(0, perUser.length - topUsersInWidget),
  );

  const maxAgentCount = $derived(
    perAgent.reduce((max, agent) => Math.max(max, agent.count), 0),
  );
  const maxUserCount = $derived(
    widgetUsers.reduce((max, user) => Math.max(max, user.count), 0),
  );

  const numberFormatter = new Intl.NumberFormat();

  function formatNumber(value: number): string {
    return numberFormatter.format(value);
  }

  const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function formatTimestamp(iso: string | null): string {
    return iso ? dateTimeFormatter.format(new Date(iso)) : "—";
  }

  function userLabel(user: { name: string | null; userId: string }): string {
    return user.name ?? `Deleted user (${user.userId})`;
  }
</script>

<svelte:head>
  <title>AI chat usage | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Admin dashboard showing AI chat usage across all users and agents."
  />
</svelte:head>

<div class="relative isolate min-h-screen overflow-hidden">
  <div class="bg-background absolute inset-0 -z-20"></div>
  <div
    class="absolute inset-x-0 top-0 -z-10 h-[20rem] bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklab,var(--color-chart-1)_20%,transparent),transparent_32%),radial-gradient(circle_at_90%_18%,_color-mix(in_oklab,var(--color-chart-2)_18%,transparent),transparent_28%)]"
  ></div>

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
          AI chat usage
        </h1>
        <p class="text-muted-foreground max-w-2xl text-base leading-7">
          Every AI conversation across the tool — totals, per-agent and per-user
          breakdowns, and a drill-down into each user's chats.
        </p>
      </div>

      <Button href="/admin" variant="outline">
        <ArrowLeftIcon class="size-4" />
        Back to admin
      </Button>
    </section>

    <section class="grid gap-4 lg:grid-cols-3">
      <Card.Root class="border-border/70 bg-background/90 backdrop-blur">
        <Card.Header class="pb-2">
          <Card.Description>Total chats</Card.Description>
          <Card.Title class="text-4xl tracking-[-0.03em] tabular-nums">
            {formatNumber(overview.totalChats)}
          </Card.Title>
        </Card.Header>
        <Card.Content>
          <p class="text-muted-foreground text-sm">
            Conversations stored across {formatNumber(perUser.length)}
            {perUser.length === 1 ? "user" : "users"} and {formatNumber(
              perAgent.length,
            )}
            {perAgent.length === 1 ? "agent" : "agents"}.
          </p>
        </Card.Content>
      </Card.Root>

      <Card.Root class="border-border/70 bg-background/90 backdrop-blur">
        <Card.Header class="pb-2">
          <Card.Description>Chats per agent</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-3">
          {#if perAgent.length === 0}
            <p class="text-muted-foreground text-sm">No chats yet.</p>
          {:else}
            {#each perAgent as agent (agent.agentId)}
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-sm">
                  <span class="font-medium">{agentLabel(agent.agentId)}</span>
                  <span class="text-muted-foreground">
                    {formatNumber(agent.count)}
                  </span>
                </div>
                <div class="bg-muted h-2 w-full overflow-hidden rounded-full">
                  <div
                    class="bg-primary h-full rounded-full"
                    style:width={`${maxAgentCount > 0 ? (agent.count / maxAgentCount) * 100 : 0}%`}
                  ></div>
                </div>
              </div>
            {/each}
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root class="border-border/70 bg-background/90 backdrop-blur">
        <Card.Header class="pb-2">
          <Card.Description>Chats per user</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-3">
          {#if widgetUsers.length === 0}
            <p class="text-muted-foreground text-sm">No chats yet.</p>
          {:else}
            {#each widgetUsers as user (user.userId)}
              <div class="space-y-1.5">
                <div class="flex items-center justify-between gap-2 text-sm">
                  <span class="truncate font-medium">{userLabel(user)}</span>
                  <span class="text-muted-foreground shrink-0">
                    {formatNumber(user.count)}
                  </span>
                </div>
                <div class="bg-muted h-2 w-full overflow-hidden rounded-full">
                  <div
                    class="bg-primary h-full rounded-full"
                    style:width={`${maxUserCount > 0 ? (user.count / maxUserCount) * 100 : 0}%`}
                  ></div>
                </div>
              </div>
            {/each}
            {#if remainingUsers > 0}
              <p class="text-muted-foreground text-xs">
                +{formatNumber(remainingUsers)} more in the table below.
              </p>
            {/if}
          {/if}
        </Card.Content>
      </Card.Root>
    </section>

    <section>
      <Card.Root class="border-border/70 bg-background/90 backdrop-blur">
        <Card.Header>
          <Card.Title class="text-xl tracking-[-0.02em]">
            Users with chats
          </Card.Title>
          <Card.Description>
            Every account that has talked to an AI agent. Click a user to view
            all of their conversations.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {#if perUser.length === 0}
            <p class="text-muted-foreground text-sm">No chats yet.</p>
          {:else}
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.Head class="w-10">#</Table.Head>
                  <Table.Head>User</Table.Head>
                  <Table.Head>Last activity</Table.Head>
                  <Table.Head class="text-right">Chats</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {#each perUser as user, index (user.userId)}
                  <Table.Row>
                    <Table.Cell class="text-muted-foreground">
                      {index + 1}
                    </Table.Cell>
                    <Table.Cell>
                      <a
                        href={`/admin/chat-usage/${user.userId}`}
                        class="group flex flex-col"
                      >
                        <span
                          class="font-medium underline-offset-4 group-hover:underline"
                        >
                          {userLabel(user)}
                        </span>
                        <span class="text-muted-foreground text-xs">
                          {user.email ?? user.userId}
                        </span>
                      </a>
                    </Table.Cell>
                    <Table.Cell class="text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(user.lastActivity)}
                    </Table.Cell>
                    <Table.Cell class="text-right">
                      <Badge variant="secondary">
                        {formatNumber(user.count)}
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                {/each}
              </Table.Body>
            </Table.Root>
          {/if}
        </Card.Content>
      </Card.Root>
    </section>
  </main>
</div>
