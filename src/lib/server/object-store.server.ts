import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getImageGeneratorEnv, getStorageEnv } from "./env";

/**
 * A storage key is a POSIX-style, slash-separated path that is portable across
 * machines and operating systems — e.g. `images/<id>.png`. It is what we now
 * persist in the `localPath` columns (the column name is historical; the value
 * is a key, not a filesystem path). The active {@link ObjectStore} maps a key
 * to either a Supabase Storage object or a file under `UPLOADS_DIR`.
 */
export type StorageKey = string;

export interface ObjectStore {
  /** Upload bytes under `key`, overwriting any existing object. */
  put(key: StorageKey, bytes: Buffer, contentType: string): Promise<void>;
  /** Download bytes; throws if the object does not exist. */
  get(key: StorageKey): Promise<Buffer>;
  /** Download bytes; resolves to `null` if the object does not exist. */
  tryGet(key: StorageKey): Promise<Buffer | null>;
  /** Read a UTF-8 text object; resolves to `null` if it does not exist. */
  getText(key: StorageKey): Promise<string | null>;
  /** Write a UTF-8 text object, overwriting any existing object. */
  putText(key: StorageKey, text: string, contentType?: string): Promise<void>;
  /** Delete an object; resolves quietly if it does not exist. */
  remove(key: StorageKey): Promise<void>;
  /** Server-side copy from one key to another. */
  copy(srcKey: StorageKey, destKey: StorageKey): Promise<void>;
}

/**
 * Guards against traversal/absolute keys. Keys are always relative, POSIX, and
 * may not contain `..` segments or backslashes.
 */
export function assertSafeKey(key: StorageKey): StorageKey {
  if (
    !key ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("..") ||
    key.split("/").some((segment) => segment === "" || segment === ".")
  ) {
    throw new Error(`Invalid storage key: ${JSON.stringify(key)}`);
  }
  return key;
}

// --------------------------------------------------------------------------
// Local filesystem driver — used in dev and tests when Supabase is unset.
// --------------------------------------------------------------------------

export class LocalObjectStore implements ObjectStore {
  constructor(private readonly rootDir: string) {}

  private toPath(key: StorageKey): string {
    return join(this.rootDir, ...assertSafeKey(key).split("/"));
  }

  async put(
    key: StorageKey,
    bytes: Buffer,
    _contentType?: string,
  ): Promise<void> {
    const filePath = this.toPath(key);
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
    await writeFile(filePath, bytes, { mode: 0o600 });
  }

  async get(key: StorageKey): Promise<Buffer> {
    return readFile(this.toPath(key));
  }

  async tryGet(key: StorageKey): Promise<Buffer | null> {
    try {
      return await readFile(this.toPath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async getText(key: StorageKey): Promise<string | null> {
    try {
      return await readFile(this.toPath(key), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  async putText(key: StorageKey, text: string): Promise<void> {
    const filePath = this.toPath(key);
    await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
    await writeFile(filePath, text, { mode: 0o600, encoding: "utf8" });
  }

  async remove(key: StorageKey): Promise<void> {
    try {
      await unlink(this.toPath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  async copy(srcKey: StorageKey, destKey: StorageKey): Promise<void> {
    const dest = this.toPath(destKey);
    await mkdir(dirname(dest), { recursive: true, mode: 0o700 });
    await copyFile(this.toPath(srcKey), dest);
  }
}

// --------------------------------------------------------------------------
// Supabase Storage driver — the shared object store used in production.
// --------------------------------------------------------------------------

export class SupabaseObjectStore implements ObjectStore {
  constructor(
    private readonly client: SupabaseClient,
    private readonly bucket: string,
  ) {}

  private from() {
    return this.client.storage.from(this.bucket);
  }

  async put(
    key: StorageKey,
    bytes: Buffer,
    contentType: string,
  ): Promise<void> {
    const { error } = await this.from().upload(assertSafeKey(key), bytes, {
      contentType,
      upsert: true,
    });
    if (error) {
      throw new Error(`Supabase upload failed for ${key}: ${error.message}`);
    }
  }

  async get(key: StorageKey): Promise<Buffer> {
    const bytes = await this.tryGet(key);
    if (!bytes) {
      throw new Error(`Object not found in Supabase storage: ${key}`);
    }
    return bytes;
  }

  async tryGet(key: StorageKey): Promise<Buffer | null> {
    const { data, error } = await this.from().download(assertSafeKey(key));
    if (error || !data) {
      return null;
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async getText(key: StorageKey): Promise<string | null> {
    const { data, error } = await this.from().download(assertSafeKey(key));
    if (error || !data) {
      return null;
    }
    return data.text();
  }

  async putText(
    key: StorageKey,
    text: string,
    contentType = "text/markdown; charset=utf-8",
  ): Promise<void> {
    await this.put(key, Buffer.from(text, "utf8"), contentType);
  }

  async remove(key: StorageKey): Promise<void> {
    const { error } = await this.from().remove([assertSafeKey(key)]);
    if (error) {
      throw new Error(`Supabase remove failed for ${key}: ${error.message}`);
    }
  }

  async copy(srcKey: StorageKey, destKey: StorageKey): Promise<void> {
    const { error } = await this.from().copy(
      assertSafeKey(srcKey),
      assertSafeKey(destKey),
    );
    if (error) {
      throw new Error(
        `Supabase copy failed (${srcKey} -> ${destKey}): ${error.message}`,
      );
    }
  }
}

// --------------------------------------------------------------------------
// Driver selection.
// --------------------------------------------------------------------------

const globalForStore = globalThis as typeof globalThis & {
  supabaseStorageClient?: SupabaseClient;
  supabaseStorageClientUrl?: string;
};

function getSupabaseClient(url: string, serviceKey: string): SupabaseClient {
  if (
    globalForStore.supabaseStorageClient &&
    globalForStore.supabaseStorageClientUrl === url
  ) {
    return globalForStore.supabaseStorageClient;
  }
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  globalForStore.supabaseStorageClient = client;
  globalForStore.supabaseStorageClientUrl = url;
  return client;
}

/**
 * Returns the active object store. Uses Supabase Storage when fully
 * configured, otherwise the local filesystem under `UPLOADS_DIR`.
 */
export function getObjectStore(): ObjectStore {
  const storage = getStorageEnv();
  if (
    storage.SUPABASE_URL &&
    storage.SUPABASE_SERVICE_ROLE_KEY &&
    storage.SUPABASE_STORAGE_BUCKET
  ) {
    const client = getSupabaseClient(
      storage.SUPABASE_URL,
      storage.SUPABASE_SERVICE_ROLE_KEY,
    );
    return new SupabaseObjectStore(client, storage.SUPABASE_STORAGE_BUCKET);
  }
  return new LocalObjectStore(getImageGeneratorEnv().UPLOADS_DIR);
}
