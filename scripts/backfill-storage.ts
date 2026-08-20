import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import ws from "ws";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep, extname } from "node:path";

config(); // load .env

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET;
const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./uploads";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_STORAGE_BUCKET) {
  console.error(
    "Missing Supabase config. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET in .env before running.",
  );
  process.exit(1);
}

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".md": "text/markdown; charset=utf-8",
};

function contentTypeFor(path: string): string {
  return (
    CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream"
  );
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function main() {
  const root = UPLOADS_DIR;
  try {
    const s = await stat(root);
    if (!s.isDirectory()) throw new Error("not a directory");
  } catch {
    console.error(
      `UPLOADS_DIR "${root}" does not exist or is not a directory.`,
    );
    process.exit(1);
  }

  const client = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Realtime is unused, but createClient constructs it anyway and it
    // hard-fails on Node < 22 without a WebSocket transport.
    realtime: { transport: ws as unknown as WebSocketLikeConstructor },
  });
  const bucket = client.storage.from(SUPABASE_STORAGE_BUCKET!);

  let uploaded = 0;
  let failed = 0;
  let total = 0;

  for await (const filePath of walk(root)) {
    total++;
    // Storage key = path relative to UPLOADS_DIR, with POSIX separators.
    const key = relative(root, filePath).split(sep).join("/");
    if (dryRun) {
      console.log(`[dry-run] would upload ${key}`);
      continue;
    }
    try {
      const bytes = await readFile(filePath);
      const { error } = await bucket.upload(key, bytes, {
        contentType: contentTypeFor(filePath),
        upsert: true,
      });
      if (error) {
        failed++;
        console.error(`FAILED ${key}: ${error.message}`);
      } else {
        uploaded++;
        console.log(`uploaded ${key}`);
      }
    } catch (err) {
      failed++;
      console.error(`FAILED ${key}: ${(err as Error).message}`);
    }
  }

  console.log(
    `\nDone. ${dryRun ? `${total} files would be uploaded (dry run).` : `${uploaded}/${total} uploaded, ${failed} failed.`}`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
