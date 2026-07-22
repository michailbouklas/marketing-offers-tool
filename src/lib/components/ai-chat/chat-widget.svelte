<script lang="ts">
  import { Chat } from "@ai-sdk/svelte";
  import { DefaultChatTransport } from "ai";
  import { Portal } from "bits-ui";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import {
    EXCEL_TOOL_PART_TYPE,
    excelErrorText,
    excelOutput,
  } from "$lib/components/ai-chat/excel-tool";
  import { renderMarkdown } from "$lib/components/ai-chat/markdown";
  import DatabaseIcon from "@lucide/svelte/icons/database";
  import FileSpreadsheetIcon from "@lucide/svelte/icons/file-spreadsheet";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import Maximize2Icon from "@lucide/svelte/icons/maximize-2";
  import Minimize2Icon from "@lucide/svelte/icons/minimize-2";
  import SendHorizontalIcon from "@lucide/svelte/icons/send-horizontal";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import SquarePenIcon from "@lucide/svelte/icons/square-pen";
  import XIcon from "@lucide/svelte/icons/x";

  type ChatSession = {
    key: string;
    title: string;
    updatedAt: string | null;
  };

  interface Props {
    /** Backend agent this section routes its messages to. */
    agentId: string;
    title?: string;
    /** Greeting shown before the first message. */
    greeting?: string;
    placeholder?: string;
  }

  let {
    agentId,
    title = "AI Assistant",
    greeting = "Hi! Ask me anything about this page's data.",
    placeholder = "Ask a question…",
  }: Props = $props();

  let open = $state(false);
  let maximized = $state(false);
  let input = $state("");
  let scrollContainer: HTMLDivElement | null = $state(null);
  let textareaRef: HTMLTextAreaElement | null = $state(null);
  let historyRequested = false;
  let historyOpen = $state(false);
  let sessions = $state<ChatSession[]>([]);
  // Conversations are keyed client-side; the server namespaces the key per
  // agent + user, so a fresh key = a fresh thread while old ones stay stored.
  let sessionKey = $state<string>(crypto.randomUUID());

  const chat = new Chat({
    transport: new DefaultChatTransport({ api: "/api/ai/chat" }),
  });

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
      // Best effort — the history menu just stays empty.
    }
  }

  // Recalls a stored conversation and renders it as-is.
  async function loadSession(key: string) {
    if (busy) {
      return;
    }

    try {
      const response = await fetch(
        `/api/ai/chat?agentId=${encodeURIComponent(agentId)}&session=${encodeURIComponent(key)}`,
      );

      if (!response.ok) {
        return;
      }

      const history = (await response.json()) as typeof chat.messages;
      sessionKey = key;
      chat.messages = history;
    } catch {
      // Best effort — keep the current conversation on failure.
    } finally {
      historyOpen = false;
    }
  }

  // "Clear": start a fresh thread. The previous conversation stays in the
  // database and remains recallable from the history menu.
  function newConversation() {
    if (busy) {
      return;
    }

    sessionKey = crypto.randomUUID();
    chat.messages = [];
    historyOpen = false;
  }

  // On first open, resume the most recent conversation (if any).
  $effect(() => {
    if (open && !historyRequested) {
      historyRequested = true;
      void (async () => {
        await fetchSessions();

        if (sessions.length > 0) {
          await loadSession(sessions[0].key);
        }
      })();
    }
  });

  // Titles are AI-generated shortly after the first exchange, so refresh the
  // list every time the history menu opens.
  $effect(() => {
    if (historyOpen) {
      void fetchSessions();
    }
  });

  const busy = $derived(
    chat.status === "submitted" || chat.status === "streaming",
  );

  function handleSubmit(event?: SubmitEvent) {
    event?.preventDefault();
    const text = input.trim();

    if (!text || busy) {
      return;
    }

    // agentId/sessionKey ride along per request (instead of on the transport)
    // so they are read at send time, keeping them reactive.
    void chat.sendMessage({ text }, { body: { agentId, sessionKey } });
    input = "";
  }

  // Enter sends, Shift+Enter inserts a newline — same as Claude.
  function handleInputKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  // Grow the composer with its content (capped; scrolls beyond the cap).
  // Explicit height also covers browsers without `field-sizing: content`.
  $effect(() => {
    void input;

    if (textareaRef) {
      textareaRef.style.height = "auto";
      textareaRef.style.height = `${Math.min(textareaRef.scrollHeight, 160)}px`;
    }
  });

  // Lock the page behind the panel while it is open so scrolling inside the
  // conversation never scrolls the app underneath.
  $effect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  });

  // Keep the newest message in view while the answer streams in.
  $effect(() => {
    void chat.messages.at(-1)?.parts.length;
    void chat.status;

    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  });
</script>

<!-- Portaled to <body>: pages that mount the widget inside an `isolate`/
  stacking-context wrapper (e.g. the invoices hero background) would otherwise
  paint it below the sidebar (z-10) and top nav (z-40). -->
<Portal>
  {#if open}
    <Card.Root
      class={[
        "fixed right-6 bottom-24 z-50 flex max-h-[calc(100dvh-8rem)] max-w-[calc(100vw-3rem)] flex-col gap-0 overflow-hidden p-0 shadow-xl",
        maximized ? "h-[calc(100dvh-8rem)] w-[90vw]" : "h-[36rem] w-[26rem]",
      ].join(" ")}
    >
      <div class="flex items-center gap-2 border-b px-4 py-3">
        <SparklesIcon class="text-primary size-4" />
        <span class="text-sm font-semibold">{title}</span>
        <div class="ml-auto flex items-center gap-1">
          <Popover.Root bind:open={historyOpen}>
            <Popover.Trigger>
              {#snippet child({ props })}
                <Button
                  {...props}
                  variant="ghost"
                  size="icon"
                  class="size-7"
                  aria-label="Conversation history"
                >
                  <HistoryIcon class="size-4" />
                </Button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Content align="end" class="w-72 p-1">
              {#if sessions.length === 0}
                <p class="text-muted-foreground px-3 py-2 text-sm">
                  No previous conversations yet.
                </p>
              {:else}
                <div class="max-h-64 overflow-y-auto overscroll-contain">
                  {#each sessions as session (session.key)}
                    <button
                      type="button"
                      class={[
                        "hover:bg-accent flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left",
                        session.key === sessionKey ? "bg-accent" : "",
                      ].join(" ")}
                      onclick={() => loadSession(session.key)}
                    >
                      <span class="truncate text-sm">{session.title}</span>
                      {#if session.updatedAt}
                        <span class="text-muted-foreground text-xs">
                          {new Date(session.updatedAt).toLocaleString()}
                        </span>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </Popover.Content>
          </Popover.Root>
          <Button
            variant="ghost"
            size="icon"
            class="size-7"
            aria-label="New conversation"
            disabled={busy}
            onclick={newConversation}
          >
            <SquarePenIcon class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-7"
            aria-label={maximized ? "Restore chat size" : "Maximize chat"}
            onclick={() => (maximized = !maximized)}
          >
            {#if maximized}
              <Minimize2Icon class="size-4" />
            {:else}
              <Maximize2Icon class="size-4" />
            {/if}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-7"
            aria-label="Close chat"
            onclick={() => (open = false)}
          >
            <XIcon class="size-4" />
          </Button>
        </div>
      </div>

      <div
        bind:this={scrollContainer}
        class="flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3"
      >
        {#if chat.messages.length === 0}
          <p class="text-muted-foreground text-sm">{greeting}</p>
        {/if}

        {#each chat.messages as message, messageIndex (message.id ?? messageIndex)}
          {#if message.role === "user"}
            <div class="flex justify-end">
              <div
                class="bg-primary text-primary-foreground max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
              >
                {#each message.parts as part, partIndex (partIndex)}
                  {#if part.type === "text"}{part.text}{/if}
                {/each}
              </div>
            </div>
          {:else if message.role === "assistant"}
            <div class="space-y-1">
              {#each message.parts as part, partIndex (partIndex)}
                {#if part.type === "text"}
                  <div
                    class="prose prose-sm dark:prose-invert prose-p:my-1.5 prose-table:my-2 prose-th:px-2 prose-td:px-2 max-w-none text-sm"
                  >
                    <!-- eslint-disable-next-line svelte/no-at-html-tags — sanitized in renderMarkdown -->
                    {@html renderMarkdown(part.text)}
                  </div>
                {:else if part.type === EXCEL_TOOL_PART_TYPE}
                  {@const output = excelOutput(part)}
                  {@const errorText = excelErrorText(part)}
                  {#if output?.ok}
                    <a
                      href={output.downloadUrl}
                      download={output.filename}
                      class="bg-muted hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium"
                    >
                      <FileSpreadsheetIcon class="text-primary size-3.5" />
                      {output.filename}
                    </a>
                  {:else if output || errorText}
                    <p class="text-destructive text-xs">
                      Excel export failed: {errorText ??
                        (output && !output.ok ? output.error : "unknown error")}
                    </p>
                  {:else}
                    <p
                      class="text-muted-foreground flex animate-pulse items-center gap-1.5 text-xs"
                    >
                      <FileSpreadsheetIcon class="size-3" />
                      Generating Excel…
                    </p>
                  {/if}
                {:else if part.type.startsWith("tool-") || part.type === "dynamic-tool"}
                  <p
                    class="text-muted-foreground flex items-center gap-1.5 text-xs"
                  >
                    <DatabaseIcon class="size-3" />
                    Queried the database
                  </p>
                {/if}
              {/each}
            </div>
          {/if}
        {/each}

        {#if chat.status === "submitted"}
          <p class="text-muted-foreground animate-pulse text-sm">Thinking…</p>
        {/if}

        {#if chat.status === "error"}
          <p class="text-destructive text-sm">
            Something went wrong{chat.error?.message
              ? `: ${chat.error.message}`
              : ""}. Please try again.
          </p>
        {/if}
      </div>

      <form
        class="flex items-end gap-2 border-t px-4 py-3"
        onsubmit={handleSubmit}
      >
        <Textarea
          bind:ref={textareaRef}
          bind:value={input}
          {placeholder}
          rows={1}
          autocomplete="off"
          class="max-h-40 min-h-9 flex-1 resize-none overflow-y-auto"
          onkeydown={handleInputKeydown}
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send message"
          disabled={busy || input.trim().length === 0}
        >
          <SendHorizontalIcon class="size-4" />
        </Button>
      </form>
    </Card.Root>
  {/if}

  <Button
    size="icon"
    class="fixed right-6 bottom-6 z-50 size-12 rounded-full shadow-lg"
    aria-label={open ? "Close AI assistant" : "Open AI assistant"}
    onclick={() => (open = !open)}
  >
    <SparklesIcon class="size-5" />
  </Button>
</Portal>
