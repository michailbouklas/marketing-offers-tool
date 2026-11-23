<script lang="ts">
  import { parseAttachmentText } from "$lib/components/ai-chat/attachments";
  import FileSpreadsheetIcon from "@lucide/svelte/icons/file-spreadsheet";
  import FileTextIcon from "@lucide/svelte/icons/file-text";

  interface Props {
    parts: { type: string; [key: string]: unknown }[];
    /** Locate stored attachments (reference markers) of this conversation. */
    agentId: string;
    sessionKey: string;
  }

  let { parts, agentId, sessionKey }: Props = $props();

  type Attachment =
    | { kind: "image"; url: string; name: string }
    | { kind: "file"; url?: string; name: string; spreadsheet: boolean };

  const attachments = $derived(
    parts.flatMap((part): Attachment[] => {
      // Just sent: still a local data URL.
      if (part.type === "file") {
        const url = String(part.url ?? "");
        const mediaType = String(part.mediaType ?? "");
        const name = String(part.filename ?? (mediaType || "file"));
        return mediaType.startsWith("image/")
          ? [{ kind: "image", url, name }]
          : [{ kind: "file", url, name, spreadsheet: false }];
      }
      const marker =
        part.type === "text" ? parseAttachmentText(String(part.text)) : null;
      if (!marker) return [];
      // Reloaded from history: the bytes live in the object store.
      const url = marker.ref
        ? `/api/ai/chat/attachments?${new URLSearchParams({ agentId, session: sessionKey, ref: marker.ref })}`
        : undefined;
      if (url && marker.type.startsWith("image/")) {
        return [{ kind: "image", url, name: marker.name }];
      }
      return [
        {
          kind: "file",
          // Converted files are stored as extracted text, not the original.
          url: marker.ref?.endsWith(".txt") ? undefined : url,
          name: marker.name,
          spreadsheet: /\.(xlsx|csv|tsv)$/i.test(marker.name),
        },
      ];
    }),
  );
</script>

{#if attachments.length > 0}
  <div class="flex flex-wrap justify-end gap-1.5">
    {#each attachments as attachment, index (index)}
      {#if attachment.kind === "image"}
        <img
          src={attachment.url}
          alt={attachment.name}
          title={attachment.name}
          class="max-h-40 max-w-[85%] rounded-lg border object-contain"
        />
      {:else}
        {@const Icon = attachment.spreadsheet
          ? FileSpreadsheetIcon
          : FileTextIcon}
        <svelte:element
          this={attachment.url ? "a" : "span"}
          href={attachment.url}
          download={attachment.url ? attachment.name : undefined}
          class="bg-muted inline-flex max-w-56 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium"
        >
          <Icon class="text-primary size-3.5 shrink-0" />
          <span class="truncate">{attachment.name}</span>
        </svelte:element>
      {/if}
    {/each}
  </div>
{/if}
