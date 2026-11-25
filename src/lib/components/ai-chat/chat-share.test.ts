import { describe, expect, it } from "vitest";
import {
  chatAgentPagePaths,
  chatAgents,
} from "$lib/server/mastra/chat-registry";
import {
  ATTACHMENT_NOT_SHARED,
  isShareableAgent,
  shareAccess,
  UNSHAREABLE_AGENT_IDS,
  withoutAttachments,
} from "./chat-share";

const brandScoped = { brandScoped: true };
const base = {
  isOwner: false,
  agent: brandScoped,
  requiredAliases: ["BK", "PH"],
  viewerAliases: ["BK", "PH"],
};

describe("shareAccess", () => {
  it("always lets the owner in", () => {
    expect(shareAccess({ ...base, isOwner: true, viewerAliases: [] })).toBe(
      "ok",
    );
    expect(
      shareAccess({
        ...base,
        isOwner: true,
        agent: { googleAnalyticsScoped: true },
      }),
    ).toBe("ok");
  });

  it("lets in a viewer whose brands cover the conversation's", () => {
    expect(shareAccess(base)).toBe("ok");
    expect(
      shareAccess({ ...base, viewerAliases: ["KFC", "PH", "BK", "TB"] }),
    ).toBe("ok");
  });

  it("refuses a viewer with a narrower scope", () => {
    expect(shareAccess({ ...base, viewerAliases: ["BK"] })).toBe("forbidden");
    expect(shareAccess({ ...base, viewerAliases: [] })).toBe("forbidden");
    // "All brands" is every active alias: one missing brand is enough.
    expect(
      shareAccess({
        ...base,
        requiredAliases: ["BK", "PH", "KFC", "TB"],
        viewerAliases: ["BK", "PH", "KFC"],
      }),
    ).toBe("forbidden");
  });

  it("does not check brands for an agent without a data scope", () => {
    expect(shareAccess({ ...base, agent: {}, viewerAliases: [] })).toBe("ok");
  });

  it("refuses agents whose scope is not brand aliases", () => {
    for (const agent of [
      { googleAnalyticsScoped: true },
      { managementAccountsScoped: true },
      undefined,
    ]) {
      expect(shareAccess({ ...base, agent })).toBe("unsupported");
    }
  });
});

describe("shareable agents", () => {
  it("lists the unshareable agents exactly as the registry flags them", () => {
    for (const [agentId, config] of Object.entries(chatAgents)) {
      expect(isShareableAgent(config), agentId).toBe(
        !UNSHAREABLE_AGENT_IDS.includes(agentId),
      );
    }
  });

  it("has a chat page for every shareable agent", () => {
    for (const [agentId, config] of Object.entries(chatAgents)) {
      if (isShareableAgent(config)) {
        expect(chatAgentPagePaths[agentId], agentId).toMatch(/^\//);
      }
    }
  });
});

describe("withoutAttachments", () => {
  const ref =
    '<attachment name="sales.xlsx" type="text/plain" ref="3f0c1a52-8f0e-4c0b-9d59-0d7f6f2f7a11.txt"/>';

  it("replaces files and attachment markers, keeps the rest", () => {
    const [message] = withoutAttachments([
      {
        id: "m1",
        content: {
          format: 2,
          content: `${ref}\nwhat is this?`,
          experimental_attachments: [{ url: "data:image/png;base64,AAAA" }],
          parts: [
            { type: "file", url: "data:image/png;base64,AAAA" },
            { type: "text", text: ref },
            {
              type: "text",
              text: '<attachment name="a.csv" type="text/csv">\n1,2\n</attachment>',
            },
            { type: "text", text: "what is this?" },
            { type: "tool-invocation" },
          ],
        },
      },
    ]);

    expect(message.id).toBe("m1");
    expect(message.content.experimental_attachments).toBeUndefined();
    expect(message.content.content).toBe(
      `${ATTACHMENT_NOT_SHARED}\nwhat is this?`,
    );
    expect(message.content.parts).toEqual([
      { type: "text", text: ATTACHMENT_NOT_SHARED },
      { type: "text", text: ATTACHMENT_NOT_SHARED },
      { type: "text", text: ATTACHMENT_NOT_SHARED },
      { type: "text", text: "what is this?" },
      { type: "tool-invocation" },
    ]);
    expect(JSON.stringify(message)).not.toMatch(/base64|ref=|1,2/);
  });
});
