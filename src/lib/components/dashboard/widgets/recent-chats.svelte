<script lang="ts">
  import ChatConversationDialog from "$lib/components/admin/chat-conversation-dialog.svelte";
  import type { RecentChatsData } from "$lib/dashboard/widgets";
  import type { UserChatThread } from "$lib/services/chat-usage";

  let { data }: { data: RecentChatsData } = $props();

  let open = $state(false);
  let selected = $state<{
    thread: UserChatThread;
    agentId: string;
    userLabel: string;
  } | null>(null);

  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
</script>

<ul class="divide-border/70 divide-y">
  {#each data.users as user (user.userId)}
    {@const userLabel = user.name ?? `Deleted user (${user.userId})`}
    <li class="py-2">
      <a
        href={`/admin/chat-usage/${encodeURIComponent(user.userId)}`}
        class="block truncate text-sm font-medium hover:underline"
      >
        {userLabel}
      </a>
      {#each user.threads as thread (thread.id)}
        <div class="flex items-baseline justify-between gap-2 pl-3">
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground truncate text-left text-xs underline-offset-4 hover:underline"
            onclick={() => {
              selected = { thread, agentId: thread.agentId, userLabel };
              open = true;
            }}
          >
            {thread.title}
          </button>
          {#if thread.updatedAt}
            <span class="text-muted-foreground shrink-0 text-xs">
              {formatter.format(new Date(thread.updatedAt))}
            </span>
          {/if}
        </div>
      {/each}
    </li>
  {/each}
</ul>

<ChatConversationDialog
  bind:open
  thread={selected?.thread ?? null}
  agentId={selected?.agentId ?? ""}
  userLabel={selected?.userLabel ?? ""}
/>
