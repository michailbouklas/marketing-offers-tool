import { browser } from "$app/environment";
import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

/**
 * Renders assistant markdown to sanitized HTML. Chat content only exists
 * client-side (the panel opens on user interaction), so the non-browser
 * branch just escapes the text — DOMPurify needs a DOM to sanitize.
 */
export function renderMarkdown(text: string): string {
  if (!browser) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  const html = marked.parse(text, { async: false });
  return DOMPurify.sanitize(html);
}
