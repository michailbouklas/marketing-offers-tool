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
