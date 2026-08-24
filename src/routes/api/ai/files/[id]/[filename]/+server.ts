import { error } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { getObjectStore } from "$lib/server/object-store.server";
import type { RequestHandler } from "./$types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mirrors the sanitizers in the generate-excel / generate-threejs-report tools. */
const FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,99}\.(xlsx|html)$/;

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Locked-down policy for AI-generated HTML reports served inline on the app
 * origin. `sandbox allow-scripts` (without allow-same-origin) gives the
 * document an opaque origin, so its scripts cannot make credentialed requests
 * against the app; `connect-src 'none'` blocks fetch outright. `data:` in
 * script-src is required for the embedded three.js importmap; the inline
 * script/style are server-templated with the data JSON-escaped.
 */
const HTML_REPORT_CSP = [
  "sandbox allow-scripts",
  "default-src 'none'",
  "script-src 'unsafe-inline' data:",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Serves AI-generated exports (stored by the generateExcel and
 * generateThreeJsReport Mastra tools under `ai-exports/<uuid>/<filename>`).
 * Any authenticated user with the link may fetch — the unguessable UUID is
 * the capability. Excel is always an attachment; HTML reports render inline
 * (sandboxed, see HTML_REPORT_CSP) unless `?download=1` forces an attachment.
 */
export const GET: RequestHandler = async (event) => {
  requireAuthenticatedApiUser(event);

  const id = event.params.id ?? "";
  const filename = event.params.filename ?? "";

  if (!UUID_PATTERN.test(id)) {
    error(400, "Invalid file id");
  }
  if (!FILENAME_PATTERN.test(filename)) {
    error(400, "Invalid filename");
  }

  const bytes = await getObjectStore().tryGet(`ai-exports/${id}/${filename}`);
  if (!bytes) {
    error(404, "Not found");
  }

  const isHtml = filename.toLowerCase().endsWith(".html");
  const forceDownload = event.url.searchParams.get("download") === "1";
  const inline = isHtml && !forceDownload;

  const headers: Record<string, string> = {
    "content-type": isHtml ? "text/html; charset=utf-8" : XLSX_MIME,
    "content-length": String(bytes.length),
    "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
  };
  if (inline) {
    headers["content-security-policy"] = HTML_REPORT_CSP;
    headers["referrer-policy"] = "no-referrer";
  }

  return new Response(new Uint8Array(bytes), { status: 200, headers });
};
