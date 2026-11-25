export type SessionGroup<T> = { label: string; sessions: T[] };

/**
 * Splits the history list into Pinned, Today, Yesterday, Previous 7 days and
 * Older, by local calendar day. Input order is kept inside each group; empty
 * groups are left out.
 */
export function groupSessions<
  T extends { updatedAt: string | null; pinned?: boolean },
>(sessions: T[], now: Date = new Date()): SessionGroup<T>[] {
  // Day arithmetic through the Date constructor stays correct across DST.
  const daysAgo = (days: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - days).getTime();
  const today = daysAgo(0);
  const yesterday = daysAgo(1);
  const weekAgo = daysAgo(7);

  const groups: SessionGroup<T>[] = [
    "Pinned",
    "Today",
    "Yesterday",
    "Previous 7 days",
    "Older",
  ].map((label) => ({ label, sessions: [] }));

  for (const session of sessions) {
    const time = session.updatedAt ? Date.parse(session.updatedAt) : NaN;
    const index = session.pinned
      ? 0
      : time >= today
        ? 1
        : time >= yesterday
          ? 2
          : time >= weekAgo
            ? 3
            : 4;
    groups[index].sessions.push(session);
  }

  return groups.filter((group) => group.sessions.length > 0);
}

/** Reads the open-tab keys kept in sessionStorage; anything malformed is []. */
export function parseOpenKeys(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");

    return Array.isArray(parsed)
      ? parsed.filter((key) => typeof key === "string")
      : [];
  } catch {
    return [];
  }
}
