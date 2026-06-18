import { prisma } from "$lib/server/prisma";

/**
 * Cross-section per-user monitor list ("favorites"). `section` scopes an entry
 * to a feature area and `entityId` is that section's stable identifier as a
 * string: for `competition` it is the ClickHouse composite
 * `"${processorId}:${restaurantId}"` or, on Google Reviews businesses,
 * `businesses.cid`.
 */
export type MonitorSectionValue = "competition" | "googleReviews";

/** Set of monitored `entityId`s for one user within a section. */
export async function getMonitoredEntityIds(
  userId: string,
  section: MonitorSectionValue,
) {
  const rows = await prisma.user_monitor.findMany({
    where: { userId, section },
    select: { entityId: true },
  });

  return new Set(rows.map((row) => row.entityId));
}

/**
 * Reverse lookup for the notification digest: given a batch of `entityId`s,
 * returns which users monitor each one within a section. The map is keyed by
 * `entityId`; entities with no monitors are simply absent. Used to match new
 * `offer_notification_queue` rows (whose `entityKey` equals `entityId` for
 * `section = 'competition'`) to the users who should be emailed.
 */
export async function getMonitorUsersByEntityIds(
  entityIds: string[],
  section: MonitorSectionValue = "competition",
): Promise<Map<string, string[]>> {
  const usersByEntityId = new Map<string, string[]>();

  if (entityIds.length === 0) {
    return usersByEntityId;
  }

  const rows = await prisma.user_monitor.findMany({
    where: { section, entityId: { in: entityIds } },
    select: { userId: true, entityId: true },
  });

  for (const row of rows) {
    const bucket = usersByEntityId.get(row.entityId);

    if (bucket) {
      bucket.push(row.userId);
    } else {
      usersByEntityId.set(row.entityId, [row.userId]);
    }
  }

  return usersByEntityId;
}

/** Adds an entry to the user's monitor list (no-op if already present). */
export async function addMonitor(
  userId: string,
  section: MonitorSectionValue,
  entityId: string,
) {
  await prisma.user_monitor.upsert({
    where: { userId_section_entityId: { userId, section, entityId } },
    create: { userId, section, entityId },
    update: {},
  });
}

/** Removes an entry from the user's monitor list (no-op if absent). */
export async function removeMonitor(
  userId: string,
  section: MonitorSectionValue,
  entityId: string,
) {
  await prisma.user_monitor.deleteMany({
    where: { userId, section, entityId },
  });
}
