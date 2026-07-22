import { getImageGeneratorEnv, getStorageEnv } from "./env";
import {
  getSupabaseClient,
  LocalObjectStore,
  SupabaseObjectStore,
  type ObjectStore,
} from "./object-store-core";

/**
 * SvelteKit-side entry point for the object store. The drivers, types, and
 * key guard live in ./object-store-core.ts (env-free, also imported by
 * src/lib/server/mastra); this module adds the `$env`-driven driver selection
 * and re-exports the core surface so existing importers are unchanged.
 */
export {
  assertSafeKey,
  LocalObjectStore,
  SupabaseObjectStore,
  type ObjectStore,
  type ObjectStoreEntry,
  type StorageKey,
} from "./object-store-core";

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
