import { describe, expect, it } from "vitest";
import {
  admitFiles,
  attachmentPartsOf,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  parseAttachmentText,
  toMessageParts,
  typedTextOf,
  validateUserMessage,
} from "./attachments";

const png = (url = "data:image/png;base64,iVBORw0KGgo=") => ({
  type: "file",
  mediaType: "image/png",
  url,
});
const userMessage = (parts: unknown[]) => ({ id: "m1", role: "user", parts });

describe("validateUserMessage", () => {
  it("accepts text plus inline image and PDF", () => {
    expect(
      validateUserMessage(
        userMessage([
          png(),
          {
            type: "file",
            mediaType: "application/pdf",
            url: "data:application/pdf;base64,JVBERi0=",
          },
          { type: "text", text: "what is this?" },
        ]),
      ),
    ).toBeNull();
  });

  it("rejects a remote file URL", () => {
    expect(
      validateUserMessage(userMessage([png("https://example.com/a.png")])),
    ).toMatchObject({ status: 400 });
  });

  it("rejects a media type outside the allowlist or mismatched with the URL", () => {
    expect(
      validateUserMessage(
        userMessage([
          {
            type: "file",
            mediaType: "text/html",
            url: "data:text/html;base64,PGI+",
          },
        ]),
      ),
    ).toMatchObject({ status: 400 });
    expect(
      validateUserMessage(
        userMessage([
          { ...png(), url: "data:application/pdf;base64,JVBERi0=" },
        ]),
      ),
    ).toMatchObject({ status: 400 });
  });

  it("rejects an oversize file", () => {
    const big = "A".repeat(Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 8);
    expect(
      validateUserMessage(userMessage([png(`data:image/png;base64,${big}`)])),
    ).toMatchObject({ status: 413 });
  });

  it("rejects too many attachments", () => {
    expect(
      validateUserMessage(
        userMessage(Array.from({ length: MAX_ATTACHMENTS + 1 }, () => png())),
      ),
    ).toMatchObject({ status: 400 });
  });

  it("rejects non-user roles, foreign part types and legacy attachment keys", () => {
    expect(
      validateUserMessage({ id: "m", role: "assistant", parts: [] }),
    ).not.toBeNull();
    expect(
      validateUserMessage(userMessage([{ type: "tool-x", input: {} }])),
    ).not.toBeNull();
    expect(
      validateUserMessage({ ...userMessage([]), experimental_attachments: [] }),
    ).not.toBeNull();
  });
});

describe("admitFiles", () => {
  it("keeps supported files and explains the rejected ones", () => {
    const { files, errors } = admitFiles(
      [],
      [
        new File(["x"], "a.png", { type: "image/png" }),
        new File(["x"], "b.docx", { type: "application/msword" }),
        new File(["a,b"], "c.csv", { type: "text/csv" }),
      ],
    );
    expect(files.map((file) => file.name)).toEqual(["a.png", "c.csv"]);
    expect(errors).toHaveLength(1);
  });
});

describe("converted text attachments", () => {
  it("wraps text files in a marker that splits from typed text", async () => {
    const parts = await toMessageParts([
      new File(['a,"b"\n1,2'], 'my "data".csv', { type: "text/csv" }),
    ]);
    const all = [...parts, { type: "text", text: "sum column a" }];
    expect(parseAttachmentText((parts[0] as { text: string }).text)).toEqual({
      name: "my _data_.csv",
      type: "text/csv",
    });
    expect(attachmentPartsOf(all)).toHaveLength(1);
    expect(typedTextOf(all)).toBe("sum column a");
  });
});
