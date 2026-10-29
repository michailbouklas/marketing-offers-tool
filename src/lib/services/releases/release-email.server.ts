import { Marked } from "marked";
import type { ReleaseDetail } from "./releases";

/**
 * Pure email template for "notify users" on /admin/features: the release
 * notes rendered from markdown with inline styles (email clients ignore the
 * app's CSS). No I/O; unit-tested in isolation. The `.server` suffix keeps it
 * out of the client bundle (it pulls `marked` in on the server).
 *
 * Safety: raw HTML in the markdown (block or inline) is escaped to visible
 * text, so a note can never inject tags; everything else comes from marked's
 * own escaping of markdown constructs.
 */

export interface BuiltReleaseEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const FONT_STACK = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";

/** Inline styles injected per tag; keyed by the tag marked emits. */
const TAG_STYLES: Record<string, string> = {
  h1: "font-size:22px;line-height:1.3;margin:24px 0 8px;font-weight:600",
  h2: "font-size:18px;line-height:1.3;margin:20px 0 6px;font-weight:600",
  h3: "font-size:16px;line-height:1.3;margin:16px 0 4px;font-weight:600",
  h4: "font-size:14px;line-height:1.3;margin:14px 0 4px;font-weight:600",
  p: "margin:0 0 12px",
  ul: "margin:0 0 12px;padding-left:22px",
  ol: "margin:0 0 12px;padding-left:22px",
  li: "margin:0 0 4px",
  a: "color:#2563eb;text-decoration:underline",
  pre: "background:#f3f4f6;border-radius:6px;padding:12px;overflow:auto;font-size:13px;margin:0 0 12px",
  code: "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;background:#f3f4f6;border-radius:4px;padding:1px 4px",
  blockquote:
    "margin:0 0 12px;padding:4px 12px;border-left:3px solid #d1d5db;color:#4b5563",
  hr: "border:0;border-top:1px solid #e5e7eb;margin:16px 0",
  table: "border-collapse:collapse;margin:0 0 12px",
  th: "border:1px solid #e5e7eb;padding:6px 10px;text-align:left;background:#f9fafb",
  td: "border:1px solid #e5e7eb;padding:6px 10px",
  img: "max-width:100%;height:auto",
};

const STYLED_TAG_PATTERN = new RegExp(
  `<(${Object.keys(TAG_STYLES).join("|")})(?=[\\s>/])`,
  "g",
);

const emailMarked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // Block-level and inline raw HTML both arrive here: show it as text.
    html(token) {
      return escapeHtml(token.text);
    },
  },
});

/** Markdown -> inline-styled HTML fragment with raw HTML neutralised. */
export function renderReleaseMarkdownForEmail(markdown: string): string {
  const html = emailMarked.parse(markdown, { async: false });
  return html.replace(
    STYLED_TAG_PATTERN,
    (_match, tag: string) => `<${tag} style="${TAG_STYLES[tag]}"`,
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10);
}

export interface ReleaseEmailOptions {
  /** Absolute app URL for the footer link; omitted when null. */
  appUrl: string | null;
}

export function buildReleaseEmail(
  release: ReleaseDetail,
  options: ReleaseEmailOptions,
): BuiltReleaseEmail {
  const subject = release.title.trim() || "Release notes";
  const meta = `Version ${release.version} · Published ${formatDate(release.createdAt)}`;
  const body = renderReleaseMarkdownForEmail(release.body);
  const appUrl = options.appUrl?.trim() || null;

  const footer = appUrl
    ? `<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #e5e7eb;font-size:13px;color:#4b5563">Open <a href="${escapeHtml(appUrl)}" style="${TAG_STYLES.a}" rel="noopener">Marketing Tools</a> to see what changed.</p>`
    : "";

  const html = `<div style="font-family:${FONT_STACK};font-size:14px;line-height:1.5;color:#111;max-width:680px"><h1 style="${TAG_STYLES.h1};margin-top:0">${escapeHtml(subject)}</h1><p style="margin:0 0 16px;font-size:13px;color:#6b7280">${escapeHtml(meta)}</p>${body}${footer}</div>`;

  const textParts = [subject, meta, "", release.body.trim()];
  if (appUrl) {
    textParts.push("", `Open Marketing Tools: ${appUrl}`);
  }

  return { subject, html, text: textParts.join("\n") };
}
