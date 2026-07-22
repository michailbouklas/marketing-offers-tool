<script lang="ts">
  import ChatConversationDialog from "$lib/components/admin/chat-conversation-dialog.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { agentLabel, type UserChatThread } from "$lib/services/chat-usage";
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const targetUser = $derived(data.targetUser);
  const agentGroups = $derived(data.agentGroups);
  const userLabel = $derived(
    targetUser?.name ?? `Deleted user (${data.targetUserId})`,
  );

  let dialogOpen = $state(false);
  let selectedThread = $state<UserChatThread | null>(null);
  let selectedAgentId = $state("");

  function openConversation(agentId: string, thread: UserChatThread) {
    selectedAgentId = agentId;
    selectedThread = thread;
    dialogOpen = true;
  }

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
</script>

<svelte:head>
  <title>Chats · {userLabel} | Aggregator Offers Tool</title>
  <meta
    name="description"
    content="Admin drill-down into one user's AI conversations, grouped per agent."
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
          {userLabel}
        </h1>
        <p class="text-muted-foreground max-w-2xl text-base leading-7">
          {#if targetUser}
            All AI conversations for {targetUser.email}, grouped per agent.
            Click a chat to read the full conversation.
          {:else}
            This account no longer exists, but its stored conversations are
            listed below. Click a chat to read the full conversation.
          {/if}
        </p>
      </div>

      <Button href="/admin/chat-usage" variant="outline">
        <ArrowLeftIcon class="size-4" />
        Back to chat usage
      </Button>
    </section>

    {#if agentGroups.length === 0}
      <Card.Root class="border-border/70 bg-background/90 backdrop-blur">
        <Card.Content>
          <p class="text-muted-foreground py-6 text-center text-sm">
            This user has no stored conversations.
          </p>
        </Card.Content>
      </Card.Root>
    {:else}
      {#each agentGroups as group (group.agentId)}
        <section>
          <Card.Root class="border-border/70 bg-background/90 backdrop-blur">
            <Card.Header>
              <Card.Title
                class="flex flex-wrap items-center gap-2 text-xl tracking-[-0.02em]"
              >
                {agentLabel(group.agentId)}
                <Badge variant="secondary">
                  {formatNumber(group.threads.length)}
                  {group.threads.length === 1 ? "chat" : "chats"}
                </Badge>
              </Card.Title>
            </Card.Header>
            <Card.Content>
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Conversation</Table.Head>
                    <Table.Head>Last updated</Table.Head>
                    <Table.Head class="text-right">Messages</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each group.threads as thread (thread.id)}
                    <Table.Row
                      class="cursor-pointer"
                      onclick={() => openConversation(group.agentId, thread)}
                    >
                      <Table.Cell>
                        <button
                          type="button"
                          class="text-left font-medium underline-offset-4 hover:underline"
                          onclick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            openConversation(group.agentId, thread);
                          }}
                        >
                          {thread.title}
                        </button>
                      </Table.Cell>
                      <Table.Cell
                        class="text-muted-foreground whitespace-nowrap"
                      >
                        {formatTimestamp(thread.updatedAt)}
                      </Table.Cell>
                      <Table.Cell class="text-right">
                        <Badge variant="secondary">
                          {formatNumber(thread.messageCount)}
                        </Badge>
                      </Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </Card.Content>
          </Card.Root>
        </section>
      {/each}
    {/if}
  </main>
</div>

<ChatConversationDialog
  bind:open={dialogOpen}
  thread={selectedThread}
  agentId={selectedAgentId}
  {userLabel}
/>
