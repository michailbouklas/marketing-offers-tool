import { randomUUID } from "node:crypto";
import type { Processor } from "@mastra/core/processors";
import {
  ATTACHMENT_REF_MARKERS,
  ATTACHMENT_REF_PATTERN,
  attachmentBody,
  attachmentRefMarker,
  parseAttachmentText,
} from "../../../components/ai-chat/attachments";
import type { ObjectStore } from "../../object-store-core";
import { getObjectStore } from "../object-store";

/**
 * Chat attachments live in the object store (Supabase in production), not in
 * the chat history: memory keeps a short `<attachment … ref="…"/>` marker and
 * the bytes are put back into the model request only while the file is
 * recent. Older files cost nothing; the model is told they are gone.
 */

/** RequestContext key: the caller's storage prefix for this conversation. */
export const CHAT_ATTACHMENTS_PREFIX_RUNTIME_KEY = "chatAttachmentsPrefix";
/** A file is sent to the model with its own turn and the next two user turns. */
export const ATTACHMENT_LIVE_TURNS = 3;

const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};
const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(EXTENSION_BY_MEDIA_TYPE).map(([type, ext]) => [ext, type]),
  ),
  txt: "text/plain; charset=utf-8",
};

/** Built from the session user server-side, so a client can only reach its own files. */
export function attachmentPrefix(
  userId: string,
  agentId: string,
  sessionKey: string,
) {
  return `ai-chat-attachments/${userId}/${agentId}/${sessionKey}`;
}

type MessagePart = Record<string, unknown>;

/**
 * Moves the attachments of a validated user message to the object store and
 * returns the parts with each one replaced by a reference marker. Markers that
 * already carry a ref (retry/edit of a stored message) pass through.
 */
export async function storeMessageAttachments(
  prefix: string,
  parts: MessagePart[],
  store: ObjectStore = getObjectStore(),
): Promise<MessagePart[]> {
  return Promise.all(
    parts.map(async (part) => {
      if (part.type === "file") {
        const mediaType = String(part.mediaType);
        const extension = EXTENSION_BY_MEDIA_TYPE[mediaType];
        const url = String(part.url);
        const ref = `${randomUUID()}.${extension}`;
        await store.put(
          `${prefix}/${ref}`,
          Buffer.from(url.slice(url.indexOf(",") + 1), "base64"),
          mediaType,
        );
        return {
          type: "text",
          text: attachmentRefMarker(
            String(part.filename ?? `file.${extension}`),
            mediaType,
            ref,
          ),
        };
      }
      const marker =
        part.type === "text" ? parseAttachmentText(String(part.text)) : null;
      if (!marker || marker.ref) return part;
      const ref = `${randomUUID()}.txt`;
      await store.putText(
        `${prefix}/${ref}`,
        attachmentBody(String(part.text)),
        MEDIA_TYPE_BY_EXTENSION.txt,
      );
      return {
        type: "text",
        text: attachmentRefMarker(marker.name, marker.type, ref),
      };
    }),
  );
}

/** Bytes + content type of one stored attachment, or null (bad ref / missing). */
export async function readAttachment(
  prefix: string,
  ref: string,
  store: ObjectStore = getObjectStore(),
) {
  if (!ATTACHMENT_REF_PATTERN.test(ref)) return null;
  const bytes = await store.tryGet(`${prefix}/${ref}`);
  const extension = ref.slice(ref.lastIndexOf(".") + 1);
  return bytes
    ? { bytes, extension, contentType: MEDIA_TYPE_BY_EXTENSION[extension] }
    : null;
}

/** HTTP response serving a stored attachment (owner and admin routes). */
export function attachmentResponse(file: {
  bytes: Buffer;
  contentType: string;
}) {
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.contentType,
      "content-length": String(file.bytes.length),
      // Images render inline (thumbnails); everything else downloads.
      "content-disposition": file.contentType.startsWith("image/")
        ? "inline"
        : "attachment",
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Deletes every stored attachment of a conversation. */
export async function removeAttachments(
  prefix: string,
  store: ObjectStore = getObjectStore(),
) {
  const entries = await store.list(prefix);
  await Promise.all(
    entries
      .filter((entry) => !entry.isFolder)
      .map((entry) => store.remove(`${prefix}/${entry.name}`)),
  );
}

type PromptPart = { type: string; text?: string; [key: string]: unknown };
type PromptMessage = { role: string; content: unknown };

/** Replaces the reference markers of one text with file parts / file text / a note. */
async function expandMarkers(
  text: string,
  live: boolean,
  load: (ref: string) => ReturnType<typeof readAttachment>,
): Promise<PromptPart[]> {
  const parts: PromptPart[] = [];
  const pushText = (value: string) => {
    if (value.trim()) parts.push({ type: "text", text: value });
  };
  let cursor = 0;

  for (const match of text.matchAll(ATTACHMENT_REF_MARKERS)) {
    const [marker, name, type, ref] = match;
    pushText(text.slice(cursor, match.index));
    cursor = match.index + marker.length;

    const file = live ? await load(ref) : null;
    if (!file) {
      pushText(
        `[attachment "${name}" was shared earlier and is no longer attached; ask the user to attach it again if you need it]`,
      );
    } else if (file.extension === "txt") {
      pushText(
        `<attachment name="${name}" type="${type}">\n${file.bytes.toString("utf8")}\n</attachment>`,
      );
    } else {
      parts.push({
        type: "file",
        data: file.bytes,
        mediaType: file.contentType,
        filename: name,
      });
    }
  }

  pushText(text.slice(cursor));
  return parts;
}

/**
 * Rewrites the prompt of one model call (not persisted — see
 * `processLLMRequest` in @mastra/core). `store` is injectable for tests.
 */
export async function inlineAttachments<Message extends PromptMessage>(
  prompt: Message[],
  prefix: string,
  cache: Map<string, ReturnType<typeof readAttachment>>,
  store?: ObjectStore,
): Promise<Message[] | undefined> {
  // Cached per request: the agent loop calls the model once per tool step.
  const load = (ref: string) => {
    if (!cache.has(ref)) cache.set(ref, readAttachment(prefix, ref, store));
    return cache.get(ref)!;
  };
  const next = [...prompt];
  let userTurn = 0;
  let changed = false;

  for (let index = next.length - 1; index >= 0; index -= 1) {
    const message = next[index];
    if (message.role !== "user" || !Array.isArray(message.content)) continue;
    userTurn += 1;
    const content: PromptPart[] = [];

    for (const part of message.content as PromptPart[]) {
      if (part.type === "text" && part.text?.includes("<attachment ")) {
        changed = true;
        content.push(
          ...(await expandMarkers(
            part.text,
            userTurn <= ATTACHMENT_LIVE_TURNS,
            load,
          )),
        );
      } else {
        content.push(part);
      }
    }
    next[index] = { ...message, content };
  }

  return changed ? next : undefined;
}

export const chatAttachmentsProcessor = {
  id: "chat-attachments",
  async processLLMRequest({ prompt, requestContext, state }) {
    const prefix = requestContext?.get(CHAT_ATTACHMENTS_PREFIX_RUNTIME_KEY);
    if (typeof prefix !== "string") return;
    state.attachments ??= new Map();
    const next = await inlineAttachments(
      prompt,
      prefix,
      state.attachments as Map<string, ReturnType<typeof readAttachment>>,
    );
    return next ? { prompt: next } : undefined;
  },
} satisfies Processor<"chat-attachments">;
