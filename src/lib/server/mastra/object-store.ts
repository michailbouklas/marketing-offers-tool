import {
  getSupabaseClient,
  LocalObjectStore,
  SupabaseObjectStore,
  type ObjectStore,
} from "../object-store-core";
import { getStorageEnv, getUploadsDir } from "./env";

/**
 * Mastra-side twin of `getObjectStore()` in ../object-store.server.ts: same
 * drivers (from the env-free core module), same driver-selection rules, but
 * env comes from ./env.ts instead of SvelteKit's `$env` so the standalone
 * `mastra dev` playground can bundle everything under src/lib/server/mastra.
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
  return new LocalObjectStore(getUploadsDir());
}
