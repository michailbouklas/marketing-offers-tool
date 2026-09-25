import { env } from "$env/dynamic/private";
import { Client } from "pg";

/**
 * Cross-process mutual exclusion on the app Postgres via a session-level
 * advisory lock held on a dedicated connection for the whole critical section
 * (a pooled connection could not safely hold a session lock). Used by the
 * offer-notification digest and the data-quality snapshot rebuild so that only
 * one process runs each job at a time. If the process dies, Postgres releases
 * the lock automatically when the connection drops.
 *
 * Keys are two arbitrary int4 constants (the two-arg form avoids overload
 * ambiguity with the single-bigint variant).
 */

export interface AdvisoryLock {
  release(): Promise<void>;
}

/**
 * Try to take the lock identified by `(key1, key2)`. Returns null when another
 * connection already holds it.
 */
export async function tryAcquireAdvisoryLock(
  key1: number,
  key2: number,
): Promise<AdvisoryLock | null> {
  const connectionString = env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS locked",
      [key1, key2],
    );

    if (!result.rows[0]?.locked) {
      await client.end();
      return null;
    }

    return {
      async release() {
        try {
          await client.query("SELECT pg_advisory_unlock($1, $2)", [key1, key2]);
        } finally {
          await client.end();
        }
      },
    };
  } catch (error) {
    await client.end();
    throw error;
  }
}
