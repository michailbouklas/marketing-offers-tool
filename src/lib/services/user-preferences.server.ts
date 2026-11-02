import { prisma } from "$lib/server/prisma";

/**
 * Per-user preferences stored in `user.meta.preferences[key]` (JSONB).
 * Callers own the key and must validate values (and what they read back:
 * stored shapes go stale when features change).
 */

export async function getUserPreference(
  userId: string,
  key: string,
): Promise<unknown> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { meta: true },
  });
  const meta = user?.meta as
    | { preferences?: Record<string, unknown> }
    | null
    | undefined;
  return meta?.preferences?.[key] ?? null;
}

/**
 * Sets (or with `null` removes) one preference atomically in SQL, so
 * concurrent writes to different keys never overwrite each other.
 */
export async function setUserPreference(
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  if (value === null) {
    await prisma.$executeRaw`
      UPDATE "user"
      SET meta = coalesce(meta, '{}'::jsonb) #- ARRAY['preferences', ${key}]::text[]
      WHERE id = ${userId}`;
    return;
  }
  await prisma.$executeRaw`
    UPDATE "user"
    SET meta = jsonb_set(
      jsonb_set(coalesce(meta, '{}'::jsonb), '{preferences}',
        coalesce(meta -> 'preferences', '{}'::jsonb), true),
      ARRAY['preferences', ${key}]::text[],
      ${JSON.stringify(value)}::jsonb,
      true)
    WHERE id = ${userId}`;
}
