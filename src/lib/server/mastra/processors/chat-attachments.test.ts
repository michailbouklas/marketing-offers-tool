import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseAttachmentText } from "../../../components/ai-chat/attachments";
import { LocalObjectStore } from "../../object-store-core";
import {
  ATTACHMENT_LIVE_TURNS,
  attachmentPrefix,
  inlineAttachments,
  readAttachment,
  removeAttachments,
  storeMessageAttachments,
} from "./chat-attachments";

let dir: string;
let store: LocalObjectStore;
const prefix = attachmentPrefix("user1", "item-analysis-agent", "session1");
const png = Buffer.from("fake-png-bytes");

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "chat-attachments-"));
  store = new LocalObjectStore(dir);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

async function storeSample() {
  const parts = await storeMessageAttachments(
    prefix,
    [
      {
        type: "file",
        mediaType: "image/png",
        filename: "shot.png",
        url: `data:image/png;base64,${png.toString("base64")}`,
      },
      {
        type: "text",
        text: '<attachment name="items.csv" type="text/csv">\na,b\n1,2\n</attachment>',
      },
      { type: "text", text: "what is this?" },
    ],
    store,
  );
  return parts.map((part) => String(part.text));
}

const user = (...texts: string[]) => ({
  role: "user",
  content: texts.map((text) => ({ type: "text", text })),
});

describe("chat attachments", () => {
  it("stores attachments and leaves only reference markers", async () => {
    const [image, csv, typed] = await storeSample();
    expect(parseAttachmentText(image)).toMatchObject({
      name: "shot.png",
      type: "image/png",
    });
    expect(image).not.toContain("base64");
    expect(parseAttachmentText(csv)?.ref).toMatch(/\.txt$/);
    expect(csv).not.toContain("a,b");
    expect(typed).toBe("what is this?");

    const stored = await readAttachment(
      prefix,
      parseAttachmentText(image)!.ref!,
      store,
    );
    expect(stored?.bytes.equals(png)).toBe(true);
  });

  it("inlines recent attachments and drops old ones from the prompt", async () => {
    const [image, csv, typed] = await storeSample();
    const fillers = Array.from({ length: ATTACHMENT_LIVE_TURNS }, (_, index) =>
      user(`filler ${index}`),
    );

    const live = await inlineAttachments(
      [user(image, csv, typed), ...fillers.slice(1)],
      prefix,
      new Map(),
      store,
    );
    expect(live![0].content).toEqual([
      {
        type: "file",
        data: png,
        mediaType: "image/png",
        filename: "shot.png",
      },
      {
        type: "text",
        text: '<attachment name="items.csv" type="text/csv">\na,b\n1,2\n</attachment>',
      },
      { type: "text", text: "what is this?" },
    ]);

    const stale = await inlineAttachments(
      [user(image, typed), ...fillers],
      prefix,
      new Map(),
      store,
    );
    const [note] = stale![0].content as { type: string; text: string }[];
    expect(note.type).toBe("text");
    expect(note.text).toContain("no longer attached");
  });

  it("never resolves refs outside the caller's prefix", async () => {
    const forged =
      '<attachment name="x.png" type="image/png" ref="../../other/secret.png"/>';
    const result = await inlineAttachments(
      [user(forged)],
      prefix,
      new Map(),
      store,
    );
    expect(JSON.stringify(result)).toContain("no longer attached");
    expect(await readAttachment(prefix, "../secret.png", store)).toBeNull();
  });

  it("leaves prompts without markers untouched and cleans up a conversation", async () => {
    expect(
      await inlineAttachments([user("hello")], prefix, new Map(), store),
    ).toBeUndefined();
    await removeAttachments(prefix, store);
    expect(await store.list(prefix)).toEqual([]);
  });
});
