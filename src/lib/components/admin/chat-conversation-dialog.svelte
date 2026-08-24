<script lang="ts">
  import {
    EXCEL_TOOL_PART_TYPE,
    excelErrorText,
    excelOutput,
  } from "$lib/components/ai-chat/excel-tool";
  import {
    THREEJS_REPORT_TOOL_PART_TYPE,
    threeJsReportErrorText,
    threeJsReportOutput,
  } from "$lib/components/ai-chat/threejs-report-tool";
  import { renderMarkdown } from "$lib/components/ai-chat/markdown";
  import ToolPart from "$lib/components/ai-chat/tool-part.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Skeleton } from "$lib/components/ui/skeleton/index.js";
  import {
    agentLabel,
    untitledConversation,
    type ChatConversationMessage,
    type ChatConversationResponse,
    type UserChatThread,
  } from "$lib/services/chat-usage";
  import ChartColumnIcon from "@lucide/svelte/icons/chart-column";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import FileSpreadsheetIcon from "@lucide/svelte/icons/file-spreadsheet";
  import { SvelteMap } from "svelte/reactivity";

  let {
    open = $bindable(false),
    thread,
    agentId,
    userLabel,
  }: {
    open?: boolean;
    /** The chat selected on the per-user page; null until one is clicked. */
    thread: UserChatThread | null;
    agentId: string;
    userLabel: string;
  } = $props();

  let messages = $state<ChatConversationMessage[] | null>(null);
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let requestSequence = 0;
  const conversationCache = new SvelteMap<string, ChatConversationMessage[]>();

  const title = $derived(thread?.title ?? untitledConversation);

  async function loadConversation(threadId: string) {
    const cached = conversationCache.get(threadId);
    const requestId = ++requestSequence;

    loadError = null;

    if (cached) {
      messages = cached;
      loading = false;
      return;
    }

    messages = null;
    loading = true;

    try {
      const response = await fetch(
        `/api/admin/chat-usage/conversation?threadId=${encodeURIComponent(threadId)}`,
      );

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const result = (await response.json()) as ChatConversationResponse;
      conversationCache.set(threadId, result.messages);

      if (requestId === requestSequence) {
        messages = result.messages;
      }
    } catch {
      if (requestId === requestSequence) {
        loadError = "Failed to load the conversation. Close and try again.";
      }
    } finally {
      if (requestId === requestSequence) {
        loading = false;
      }
    }
  }

  $effect(() => {
    if (open && thread) {
      void loadConversation(thread.id);
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
    <Dialog.Header>
      <Dialog.Title class="flex flex-wrap items-center gap-2">
        {title}
        <Badge variant="outline">{agentLabel(agentId)}</Badge>
      </Dialog.Title>
      <Dialog.Description>
        Conversation between {userLabel} and the {agentLabel(agentId)}.
      </Dialog.Description>
    </Dialog.Header>

    {#if loadError}
      <p class="text-destructive py-8 text-center text-sm">{loadError}</p>
    {:else if loading}
      <div class="space-y-3">
        <div class="flex justify-end">
          <Skeleton class="h-10 w-2/3 rounded-lg" />
        </div>
        <Skeleton class="h-24 w-full rounded-lg" />
        <div class="flex justify-end">
          <Skeleton class="h-10 w-1/2 rounded-lg" />
        </div>
        <Skeleton class="h-16 w-full rounded-lg" />
      </div>
    {:else if messages}
      {#if messages.length === 0}
        <p class="text-muted-foreground py-8 text-center text-sm">
          This conversation has no stored messages.
        </p>
      {:else}
        <div class="space-y-3">
          {#each messages as message, messageIndex (message.id ?? messageIndex)}
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
                  {#if part.type === "text" && part.text}
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
                    {:else}
                      <p class="text-muted-foreground text-xs">
                        Excel export {output || errorText
                          ? "failed"
                          : "did not complete"}{errorText
                          ? `: ${errorText}`
                          : output && !output.ok
                            ? `: ${output.error}`
                            : ""}
                      </p>
                    {/if}
                  {:else if part.type === THREEJS_REPORT_TOOL_PART_TYPE}
                    {@const report = threeJsReportOutput(part)}
                    {@const reportError = threeJsReportErrorText(part)}
                    {#if report?.ok}
                      <span class="inline-flex items-center gap-1">
                        <a
                          href={report.openUrl}
                          target="_blank"
                          rel="noopener"
                          title="Open the interactive 3D report in a new tab"
                          class="bg-muted hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium"
                        >
                          <ChartColumnIcon class="text-primary size-3.5" />
                          {report.filename}
                        </a>
                        <a
                          href={report.downloadUrl}
                          download={report.filename}
                          aria-label="Download report"
                          title="Download report"
                          class="bg-muted hover:bg-accent inline-flex items-center rounded-md border p-1.5"
                        >
                          <DownloadIcon class="size-3.5" />
                        </a>
                      </span>
                    {:else}
                      <p class="text-muted-foreground text-xs">
                        3D report {report || reportError
                          ? "failed"
                          : "did not complete"}{reportError
                          ? `: ${reportError}`
                          : report && !report.ok
                            ? `: ${report.error}`
                            : ""}
                      </p>
                    {/if}
                  {:else if part.type.startsWith("tool-") || part.type === "dynamic-tool"}
                    <ToolPart {part} />
                  {/if}
                {/each}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    {/if}
  </Dialog.Content>
</Dialog.Root>
