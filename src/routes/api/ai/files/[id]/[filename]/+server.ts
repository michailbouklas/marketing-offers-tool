import { error } from "@sveltejs/kit";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { getObjectStore } from "$lib/server/object-store.server";
import type { RequestHandler } from "./$types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mirrors the sanitizer in the generate-excel tool — anything else is 400. */
const FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,99}\.xlsx$/;

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Downloads an AI-generated Excel export (stored by the generateExcel Mastra
 * tool under `ai-exports/<uuid>/<filename>`). Any authenticated user with the
 * link may download — the unguessable UUID is the capability.
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

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": XLSX_MIME,
      "content-length": String(bytes.length),
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, max-age=3600",
    },
  });
};
