import type { FileUIPart, TextUIPart } from "ai";

/**
 * Chat attachments. Images and PDFs reach the model natively as `file` parts
 * (data URLs). Spreadsheets and text files are not readable as files by the
 * chat model, so the browser converts them to text, wrapped in an
 * `<attachment>` marker that the UI renders as a file chip.
 *
 * Attachments are stored inline in Mastra memory and replayed with the last
 * 20 messages of a thread, so these caps bound both DB growth and the tokens
 * re-sent on every turn.
 */
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** All files of one message; base64 (+33%) must stay under BODY_SIZE_LIMIT=20M. */
export const MAX_TOTAL_ATTACHMENT_BYTES = 14 * 1024 * 1024;
/** Per converted spreadsheet / text file (~12k tokens). */
export const MAX_ATTACHMENT_TEXT_CHARS = 50_000;
/** Typed text + every converted file of one message. */
export const MAX_MESSAGE_TEXT_CHARS =
  MAX_ATTACHMENTS * MAX_ATTACHMENT_TEXT_CHARS + 20_000;

export const NATIVE_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];
const SPREADSHEET_EXTENSIONS = [".xlsx"];
const TEXT_EXTENSIONS = [".csv", ".tsv", ".txt", ".md", ".json"];

/** `accept` attribute for the file picker. */
export const ATTACHMENT_ACCEPT = [
  ...NATIVE_MEDIA_TYPES,
  ...SPREADSHEET_EXTENSIONS,
  ...TEXT_EXTENSIONS,
].join(",");

type AttachmentKind = "native" | "spreadsheet" | "text";

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function attachmentKind(file: File): AttachmentKind | null {
  if (NATIVE_MEDIA_TYPES.includes(file.type)) return "native";
  const extension = extensionOf(file.name);
  if (SPREADSHEET_EXTENSIONS.includes(extension)) return "spreadsheet";
  if (TEXT_EXTENSIONS.includes(extension) || file.type.startsWith("text/")) {
    return "text";
  }
  return null;
}

/** Adds `incoming` to `current`, dropping files over the caps (with reasons). */
export function admitFiles(current: File[], incoming: File[]) {
  const files = [...current];
  const errors: string[] = [];
  let totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  for (const file of incoming) {
    if (files.length >= MAX_ATTACHMENTS) {
      errors.push(`At most ${MAX_ATTACHMENTS} files per message.`);
      break;
    }
    if (!attachmentKind(file)) {
      errors.push(
        `${file.name}: unsupported type (images, PDF, .xlsx, CSV or text).`,
      );
    } else if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(`${file.name}: larger than 10 MB.`);
    } else if (totalBytes + file.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      errors.push(`${file.name}: files of one message exceed 14 MB in total.`);
    } else {
      files.push(file);
      totalBytes += file.size;
    }
  }

  return { files, errors };
}

/**
 * Two marker forms. The browser sends converted files with their body:
 * `<attachment name type>\nbody\n</attachment>`. The server moves every
 * attachment to the object store and keeps only a reference in the chat
 * history: `<attachment name type ref="<uuid>.<ext>"/>`.
 */
const MARKER_PATTERN =
  /^<attachment name="([^"]*)" type="([^"]*)"(?: ref="([^"]*)"\/>$|>\n)/;
/** Reference markers anywhere in a text (the model prompt may merge parts). */
export const ATTACHMENT_REF_MARKERS =
  /<attachment name="([^"]*)" type="([^"]*)" ref="([^"]*)"\/>/g;
/** A stored object name: server-generated, so nothing else is ever resolved. */
export const ATTACHMENT_REF_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif|pdf|txt)$/;

const safeMarkerName = (name: string) => name.replace(/["<>\n]/g, "_");

export function attachmentRefMarker(name: string, type: string, ref: string) {
  return `<attachment name="${safeMarkerName(name)}" type="${safeMarkerName(type)}" ref="${ref}"/>`;
}

/** Body of a browser-sent converted-file marker. */
export function attachmentBody(text: string) {
  return text.slice(text.indexOf("\n") + 1).replace(/\n<\/attachment>$/, "");
}

function wrapAttachmentText(name: string, type: string, body: string) {
  const capped =
    body.length > MAX_ATTACHMENT_TEXT_CHARS
      ? `${body.slice(0, MAX_ATTACHMENT_TEXT_CHARS)}\n[truncated: first ${MAX_ATTACHMENT_TEXT_CHARS} of ${body.length} characters]`
      : body;
  return `<attachment name="${safeMarkerName(name)}" type="${type}">\n${capped}\n</attachment>`;
}

/** Name/type of a converted attachment text part, or null for typed text. */
export function parseAttachmentText(text: string) {
  const match = MARKER_PATTERN.exec(text);
  return match
    ? { name: match[1], type: match[2], ref: match[3] as string | undefined }
    : null;
}

type MessagePart = { type: string; text?: string };

/** The file parts and converted-file text parts of a message (for retry/edit). */
export function attachmentPartsOf<Part extends MessagePart>(parts: Part[]) {
  return parts.filter(
    (part) =>
      part.type === "file" ||
      (part.type === "text" && parseAttachmentText(part.text ?? "") !== null),
  );
}

/** What the user typed: text parts that are not converted files. */
export function typedTextOf(parts: MessagePart[]) {
  return parts
    .flatMap((part) =>
      part.type === "text" && !parseAttachmentText(part.text ?? "")
        ? [part.text ?? ""]
        : [],
    )
    .join("\n\n");
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text =
    value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function spreadsheetToText(file: File) {
  // Loaded on demand: only needed when someone attaches a workbook.
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  return sheets
    .map(
      ({ sheet, data }) =>
        `## Sheet: ${sheet}\n${data.map((row) => row.map(csvCell).join(",")).join("\n")}`,
    )
    .join("\n\n");
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Converts admitted files to message parts (browser only). */
export async function toMessageParts(
  files: File[],
): Promise<(FileUIPart | TextUIPart)[]> {
  return Promise.all(
    files.map(async (file): Promise<FileUIPart | TextUIPart> => {
      const kind = attachmentKind(file);
      if (kind === "native") {
        return {
          type: "file",
          mediaType: file.type,
          filename: file.name,
          url: await readAsDataUrl(file),
        };
      }
      const body =
        kind === "spreadsheet"
          ? await spreadsheetToText(file)
          : await file.text();
      return {
        type: "text",
        text: wrapAttachmentText(file.name, file.type || "text/plain", body),
      };
    }),
  );
}

/**
 * Server-side check of the newest user message (trust boundary): only text
 * and inline `data:` file parts of allowed types within the caps. A remote
 * URL is refused — the model provider would fetch a client-chosen URL.
 * Returns an error to send back, or null when the message is acceptable.
 */
export function validateUserMessage(
  message: Record<string, unknown>,
): { status: 400 | 413; message: string } | null {
  const allowedKeys = ["id", "role", "parts", "metadata"];
  if (
    message.role !== "user" ||
    !Array.isArray(message.parts) ||
    Object.keys(message).some((key) => !allowedKeys.includes(key))
  ) {
    return { status: 400, message: "Invalid chat message" };
  }

  let attachments = 0;
  let textChars = 0;
  let fileBytes = 0;

  for (const part of message.parts as Record<string, unknown>[]) {
    if (part?.type === "text" && typeof part.text === "string") {
      textChars += part.text.length;
      if (parseAttachmentText(part.text)) attachments += 1;
      continue;
    }
    if (part?.type !== "file") {
      return { status: 400, message: "Unsupported message content" };
    }
    const mediaType = String(part.mediaType ?? "");
    const prefix = `data:${mediaType};base64,`;
    if (
      !NATIVE_MEDIA_TYPES.includes(mediaType) ||
      typeof part.url !== "string" ||
      !part.url.startsWith(prefix)
    ) {
      return { status: 400, message: "Unsupported attachment" };
    }
    const bytes = Math.floor(((part.url.length - prefix.length) * 3) / 4);
    if (bytes > MAX_ATTACHMENT_BYTES) {
      return { status: 413, message: "Attachment larger than 10 MB" };
    }
    fileBytes += bytes;
    attachments += 1;
  }

  if (attachments > MAX_ATTACHMENTS) {
    return { status: 400, message: `At most ${MAX_ATTACHMENTS} attachments` };
  }
  if (fileBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return { status: 413, message: "Attachments exceed 14 MB in total" };
  }
  if (textChars > MAX_MESSAGE_TEXT_CHARS) {
    return { status: 413, message: "Message text too long" };
  }
  return null;
}
