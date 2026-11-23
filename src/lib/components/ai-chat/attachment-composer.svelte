<script lang="ts">
  import type { Snippet } from "svelte";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    admitFiles,
    ATTACHMENT_ACCEPT,
  } from "$lib/components/ai-chat/attachments";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import PaperclipIcon from "@lucide/svelte/icons/paperclip";
  import XIcon from "@lucide/svelte/icons/x";

  interface Props {
    /** Files waiting to be sent with the next message. */
    files?: File[];
    disabled?: boolean;
    /** The composer row (textarea + send button). */
    children: Snippet;
  }

  let { files = $bindable([]), disabled = false, children }: Props = $props();
  let inputRef: HTMLInputElement | null = $state(null);

  function addFiles(incoming: File[]) {
    if (disabled || incoming.length === 0) return;
    const result = admitFiles(files, incoming);
    files = result.files;
    for (const message of result.errors) toast.error(message);
  }

  // Paste only takes over when the clipboard holds files (e.g. a screenshot).
  function handlePaste(event: ClipboardEvent) {
    const pasted = [...(event.clipboardData?.files ?? [])];
    if (pasted.length > 0) {
      event.preventDefault();
      addFiles(pasted);
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    addFiles([...(event.dataTransfer?.files ?? [])]);
  }

  const previews = $derived(
    files.map((file) =>
      file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    ),
  );

  $effect(() => {
    const urls = previews;
    return () => {
      for (const url of urls) if (url) URL.revokeObjectURL(url);
    };
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions — drop/paste are shortcuts; the paperclip button is the accessible path -->
<div
  class="space-y-2"
  ondragover={(event) => event.preventDefault()}
  ondrop={handleDrop}
  onpaste={handlePaste}
>
  {#if files.length > 0}
    <ul class="flex flex-wrap gap-1.5" aria-label="Attached files">
      {#each files as file, index (file)}
        <li
          class="bg-muted flex max-w-48 items-center gap-1.5 rounded-md border py-1 pr-1 pl-1.5 text-xs"
        >
          {#if previews[index]}
            <img
              src={previews[index]}
              alt=""
              class="size-6 shrink-0 rounded object-cover"
            />
          {:else}
            <FileTextIcon class="text-primary size-4 shrink-0" />
          {/if}
          <span class="truncate" title={file.name}>{file.name}</span>
          <Button
            variant="ghost"
            size="icon"
            class="size-5 shrink-0"
            aria-label={`Remove ${file.name}`}
            onclick={() => (files = files.filter((_, i) => i !== index))}
          >
            <XIcon class="size-3" />
          </Button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="flex items-end gap-2">
    <input
      bind:this={inputRef}
      type="file"
      multiple
      accept={ATTACHMENT_ACCEPT}
      class="hidden"
      onchange={(event) => {
        addFiles([...(event.currentTarget.files ?? [])]);
        event.currentTarget.value = "";
      }}
    />
    <Button
      variant="ghost"
      size="icon"
      class="shrink-0"
      aria-label="Attach files"
      title="Attach images, PDF, Excel, CSV or text"
      {disabled}
      onclick={() => inputRef?.click()}
    >
      <PaperclipIcon class="size-4" />
    </Button>
    {@render children()}
  </div>
</div>
