import { describe, expect, it } from "vitest";
import {
  buildReleaseEmail,
  renderReleaseMarkdownForEmail,
} from "./release-email.server";
import type { ReleaseDetail } from "./releases";

const release: ReleaseDetail = {
  id: 1,
  version: "20261029-abc1234",
  title: "Sweeper & friends",
  createdAt: "2026-10-29T09:00:00.000Z",
  createdByName: "Admin",
  body: "## Highlights\n\n- Header **menu**\n- [Docs](https://example.com/docs)\n\n<script>alert(1)</script>\n\nInline <b>bold</b> stays text.",
};

describe("renderReleaseMarkdownForEmail", () => {
  it("renders markdown with inline styles", () => {
    const html = renderReleaseMarkdownForEmail("## Title\n\nSome *text*.");
    expect(html).toContain('<h2 style="');
    expect(html).toContain("Title</h2>");
    expect(html).toContain('<p style="');
    expect(html).toContain("<em>text</em>");
  });

  it("escapes raw HTML blocks and inline tags", () => {
    const html = renderReleaseMarkdownForEmail(release.body);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("keeps link hrefs and styles anchors", () => {
    const html = renderReleaseMarkdownForEmail(
      "[Docs](https://example.com/docs)",
    );
    expect(html).toContain('<a style="');
    expect(html).toContain('href="https://example.com/docs"');
  });

  it("styles nested list items and code", () => {
    const html = renderReleaseMarkdownForEmail(
      "- one\n- `two`\n\n```\nx < y\n```",
    );
    expect(html).toContain('<ul style="');
    expect(html).toContain('<li style="');
    expect(html).toContain('<code style="');
    expect(html).toContain('<pre style="');
    expect(html).toContain("x &lt; y");
  });
});

describe("buildReleaseEmail", () => {
  it("uses the title as subject and escapes it in the HTML heading", () => {
    const email = buildReleaseEmail(release, { appUrl: null });
    expect(email.subject).toBe("Sweeper & friends");
    expect(email.html).toContain("<h1");
    expect(email.html).toContain("Sweeper &amp; friends</h1>");
    expect(email.html).toContain(
      "Version 20261029-abc1234 · Published 2026-10-29",
    );
    expect(email.html).not.toContain("Marketing Tools</a>");
  });

  it("adds a footer link only when an app URL is given", () => {
    const email = buildReleaseEmail(release, {
      appUrl: "https://tools.example",
    });
    expect(email.html).toContain('href="https://tools.example"');
    expect(email.text).toContain("Open Marketing Tools: https://tools.example");
  });

  it("builds a plain-text alternative from the markdown", () => {
    const email = buildReleaseEmail(release, { appUrl: null });
    expect(email.text.startsWith("Sweeper & friends\n")).toBe(true);
    expect(email.text).toContain("## Highlights");
    expect(email.text).toContain("- Header **menu**");
  });

  it("falls back to a default subject for a blank title", () => {
    expect(
      buildReleaseEmail({ ...release, title: "  " }, { appUrl: null }).subject,
    ).toBe("Release notes");
  });
});
