<script lang="ts">
  import { Chat } from "@ai-sdk/svelte";
  import { DefaultChatTransport } from "ai";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import ChatSearchDialog from "$lib/components/ai-chat/chat-search-dialog.svelte";
  import ChatConversation from "$lib/components/ai-chat/chat-conversation.svelte";
  import { nextActiveAfterClose } from "$lib/components/ai-chat/chat-tabs";
  import SessionList, {
    type ChatSession,
  } from "$lib/components/ai-chat/session-list.svelte";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SearchIcon from "@lucide/svelte/icons/search";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import SquarePenIcon from "@lucide/svelte/icons/square-pen";
  import XIcon from "@lucide/svelte/icons/x";

  interface Props {
    /** Backend agent this page routes its messages to. */
    agentId: string;
    title?: string;
    /** Greeting shown before the first message. */
    greeting?: string;
    placeholder?: string;
    /** Optional page state sent with every message as `context` (see ChatWidget). */
    context?: Record<string, unknown>;
  }

  let {
    agentId,
    title = "AI Assistant",
    greeting = "Hi! Ask me anything about this data.",
    placeholder = "Ask a question…",
    context,
  }: Props = $props();

  /** One open tab = one conversation with its own stream. */
  type ChatTab = { key: string; chat: Chat };

  // Conversations are keyed client-side; the server namespaces the key per
  // agent + user, so a fresh key = a fresh thread while old ones stay stored.
  function newTab(key: string = crypto.randomUUID()): ChatTab {
    return {
      key,
      chat: new Chat({
        transport: new DefaultChatTransport({
          api: "/api/ai/chat",
          // Memory-backed agents: the server loads the thread history itself, so
          // only the new message travels (Mastra's documented useChat pattern).
          // Replaying the client copy made Mastra overwrite the stored assistant
          // turns with reasoning-less versions, which OpenAI's Responses API then
          // rejected on the next turn ("message ... was provided without its
          // required 'reasoning' item").
          prepareSendMessagesRequest: ({ messages, body }) => ({
            body: { ...body, messages: messages.slice(-1) },
          }),
        }),
      }),
    };
  }

  const firstTab = newTab();
  // Raw: Chat instances must not be proxied; the array is replaced, not mutated.
  let tabs = $state.raw<ChatTab[]>([firstTab]);
  let activeKey = $state(firstTab.key);
  let historyOpen = $state(false);
  let searchOpen = $state(false);
  let sessions = $state<ChatSession[]>([]);

  function isBusy(tab: ChatTab) {
    return tab.chat.status === "submitted" || tab.chat.status === "streaming";
  }

  function isBlank(tab: ChatTab) {
    return tab.chat.messages.length === 0 && !isBusy(tab);
  }

  const anyBusy = $derived(tabs.some(isBusy));
  const openKeys = $derived(tabs.map((tab) => tab.key));

  function tabTitle(key: string) {
    return sessions.find((session) => session.key === key)?.title ?? "New chat";
  }

  async function fetchSessions() {
    try {
      const response = await fetch(
        `/api/ai/chat?agentId=${encodeURIComponent(agentId)}`,
      );

      if (response.ok) {
        sessions = ((await response.json()) as { sessions: ChatSession[] })
          .sessions;
      }
    } catch {
      // Best effort — the sidebar just stays empty.
    }
  }

  // Opens a stored conversation: focuses its tab if already open, otherwise
  // recalls it into the current tab when that one is blank, else a new tab.
  async function openSession(key: string) {
    historyOpen = false;

    if (tabs.some((tab) => tab.key === key)) {
      activeKey = key;
      return;
    }

    try {
      const response = await fetch(
        `/api/ai/chat?agentId=${encodeURIComponent(agentId)}&session=${encodeURIComponent(key)}`,
      );

      if (!response.ok) {
        return;
      }

      const tab = newTab(key);
      tab.chat.messages = (await response.json()) as Chat["messages"];

      // A second click may have opened it while the fetch was in flight.
      if (!tabs.some((open) => open.key === key)) {
        const current = tabs.find((open) => open.key === activeKey);
        tabs =
          current && isBlank(current)
            ? tabs.map((open) => (open === current ? tab : open))
            : [...tabs, tab];
      }

      activeKey = key;
    } catch {
      // Best effort — keep the current tabs on failure.
    }
  }

  // Start a fresh thread in a new tab; a blank tab is reused instead of
  // stacking empty ones. Stored conversations stay recallable from the sidebar.
  function openNewTab() {
    historyOpen = false;
    const blank = tabs.find(isBlank);

    if (blank) {
      activeKey = blank.key;
      return;
    }

    const tab = newTab();
    tabs = [...tabs, tab];
    activeKey = tab.key;
  }

  // Closing only drops the tab: the conversation stays stored, and an answer
  // still streaming is left to finish server-side.
  function closeTab(key: string) {
    const next = nextActiveAfterClose(
      tabs.map((tab) => tab.key),
      activeKey,
      key,
    );

    if (next === undefined) {
      const tab = newTab();
      tabs = [tab];
      activeKey = tab.key;
      return;
    }

    tabs = tabs.filter((tab) => tab.key !== key);
    activeKey = next;
  }

  // After a delete: close the conversation's tab if it is open, then refresh.
  async function handleDeleted(key: string) {
    if (tabs.some((tab) => tab.key === key)) {
      closeTab(key);
    }

    await fetchSessions();
  }

  // The strip scrolls without a visible scrollbar, so keep the focused tab in
  // view (new tabs open at the far end).
  let tabStrip: HTMLElement | null = $state(null);
  $effect(() => {
    void tabs;
    tabStrip
      ?.querySelector(`[data-value="${activeKey}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });

  // The sidebar shows stored conversations from the start.
  $effect(() => {
    void fetchSessions();
  });
</script>

{#snippet sessionList()}
  <SessionList
    {agentId}
    {sessions}
    {activeKey}
    {openKeys}
    disabled={anyBusy}
    onSelect={openSession}
    onDeleted={handleDeleted}
  />
{/snippet}

<ChatSearchDialog
  bind:open={searchOpen}
  {agentId}
  {sessions}
  {openKeys}
  onOpen={openSession}
/>

<!-- Fills the viewport below the sticky h-14 top nav; all scrolling happens
  inside the conversation column so the page itself never scrolls. -->
<div class="flex h-[calc(100svh-3.5rem)] overflow-hidden">
  <!-- Previous-chats sidebar (desktop) -->
  <aside class="bg-muted/30 hidden w-64 shrink-0 flex-col border-r md:flex">
    <div class="space-y-1.5 p-3">
      <Button
        variant="outline"
        class="w-full justify-start gap-2"
        onclick={openNewTab}
      >
        <SquarePenIcon class="size-4" />
        New chat
      </Button>
      <Button
        variant="ghost"
        class="text-muted-foreground w-full justify-start gap-2"
        onclick={() => (searchOpen = true)}
      >
        <SearchIcon class="size-4" />
        Search chats
      </Button>
    </div>
    <nav
      class="flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2 pb-3"
      aria-label="Previous conversations"
    >
      {@render sessionList()}
    </nav>
  </aside>

  <!-- Conversation column -->
  <div class="flex min-w-0 flex-1 flex-col">
    <!-- Mobile header: history (the sidebar is hidden below md) -->
    <div class="flex items-center gap-2 border-b px-4 py-2 md:hidden">
      <SparklesIcon class="text-primary size-4" />
      <span class="text-sm font-semibold">{title}</span>
      <div class="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          class="size-8"
          aria-label="Search chats"
          onclick={() => (searchOpen = true)}
        >
          <SearchIcon class="size-4" />
        </Button>
        <Popover.Root bind:open={historyOpen}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon"
                class="size-8"
                aria-label="Conversation history"
              >
                <HistoryIcon class="size-4" />
              </Button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content align="end" class="w-72 p-1">
            <div class="max-h-64 overflow-y-auto overscroll-contain">
              {@render sessionList()}
            </div>
          </Popover.Content>
        </Popover.Root>
      </div>
    </div>

    <!-- One tab per open conversation. Inactive panels stay mounted (only
      hidden), so drafts, scroll position and running streams survive. -->
    <Tabs.Root bind:value={activeKey} class="min-h-0 flex-1 gap-0">
      <!-- Browser-style strip: tabs shrink to share the width, then scroll
        with the scrollbar hidden (wheel or focus moves the strip). -->
      <div class="bg-muted/50 flex items-end gap-1 px-2 pt-2">
        <Tabs.List
          bind:ref={tabStrip}
          class="h-auto min-w-0 flex-1 items-end justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-none bg-transparent p-0 [scrollbar-width:none] group-data-[orientation=horizontal]/tabs:h-auto [&::-webkit-scrollbar]:hidden"
          aria-label="Open conversations"
          onwheel={(event) => (event.currentTarget.scrollLeft += event.deltaY)}
        >
          {#each tabs as tab (tab.key)}
            {@const label = tabTitle(tab.key)}
            <div
              class="group/tab relative flex max-w-60 min-w-40 flex-1 basis-0 items-center"
            >
              <Tabs.Trigger
                value={tab.key}
                title={label}
                class="hover:bg-background/60 data-[state=active]:bg-background dark:data-[state=active]:bg-background h-9 w-full flex-none justify-start gap-2 rounded-t-lg rounded-b-none border-0 pr-8 pl-3 text-[13px] group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none"
              >
                {#if isBusy(tab)}
                  <span
                    class="bg-primary size-1.5 shrink-0 animate-pulse rounded-full"
                    aria-label="Answering"
                  ></span>
                {/if}
                <span class="truncate">{label}</span>
              </Tabs.Trigger>
              <button
                type="button"
                class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 absolute right-1.5 rounded-md p-1 opacity-0 outline-none group-hover/tab:opacity-100 group-has-data-[state=active]/tab:opacity-100 focus-visible:opacity-100 focus-visible:ring-[3px]"
                aria-label={`Close tab "${label}"`}
                onclick={() => closeTab(tab.key)}
              >
                <XIcon class="size-3.5" />
              </button>
            </div>
          {/each}
        </Tabs.List>
        <Button
          variant="ghost"
          size="icon"
          class="mb-1 size-7 shrink-0"
          aria-label="New tab"
          onclick={openNewTab}
        >
          <PlusIcon class="size-4" />
        </Button>
      </div>

      {#each tabs as tab (tab.key)}
        <Tabs.Content
          value={tab.key}
          class="min-h-0 flex-col data-[state=active]:flex"
        >
          <ChatConversation
            chat={tab.chat}
            {agentId}
            sessionKey={tab.key}
            {title}
            {greeting}
            {placeholder}
            {context}
            active={tab.key === activeKey}
            onSettled={fetchSessions}
          />
        </Tabs.Content>
      {/each}
    </Tabs.Root>
  </div>
</div>
