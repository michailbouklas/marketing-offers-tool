import { prisma } from "$lib/server/prisma";
import { publishReleaseEvent } from "./release-events.server";
import { normalizeReleaseBody } from "./release-form";
import {
  buildReleaseInboxItems,
  type ReleaseDetail,
  type ReleaseInbox,
  type ReleaseSummary,
} from "./releases";

/**
 * Server-only Prisma queries for release notes (`Release` / `ReleaseRead`).
 * Publishing is immediate: `createRelease` commits the row, marks it read for
 * the author, then broadcasts it to open SSE streams.
 */

export type ReleaseAdminRow = ReleaseSummary & { readCount: number };

const summarySelect = {
  id: true,
  version: true,
  title: true,
  createdAt: true,
  createdBy: { select: { name: true, email: true } },
} as const;

type SummaryRow = {
  id: number;
  version: string;
  title: string;
  createdAt: Date;
  createdBy: { name: string; email: string } | null;
};

function toSummary(row: SummaryRow): ReleaseSummary {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdBy?.name?.trim() || row.createdBy?.email || null,
  };
}

const newestFirst = [{ createdAt: "desc" }, { id: "desc" }] as const;

/** Admin table: every release, newest first, with how many users have read it. */
export async function listReleases(): Promise<ReleaseAdminRow[]> {
  const rows = await prisma.release.findMany({
    orderBy: [...newestFirst],
    select: { ...summarySelect, _count: { select: { reads: true } } },
  });
  return rows.map((row) => ({
    ...toSummary(row),
    readCount: row._count.reads,
  }));
}

export async function getReleaseDetail(
  id: number,
): Promise<ReleaseDetail | null> {
  const row = await prisma.release.findUnique({
    where: { id },
    select: { ...summarySelect, body: true },
  });
  return row ? { ...toSummary(row), body: row.body } : null;
}

export async function getLatestReleaseId(): Promise<number | null> {
  const row = await prisma.release.findFirst({
    orderBy: [...newestFirst],
    select: { id: true },
  });
  return row?.id ?? null;
}

export type CreateReleaseInput = {
  version: string;
  title: string;
  body: string;
  createdByUserId: string;
};

/**
 * Insert + auto-read for the author in one transaction (so the publisher never
 * sees their own announcement dialog), then notify live clients.
 */
export async function createRelease(
  input: CreateReleaseInput,
): Promise<ReleaseDetail> {
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.release.create({
      data: {
        version: input.version,
        title: input.title.trim(),
        body: normalizeReleaseBody(input.body),
        createdByUserId: input.createdByUserId,
      },
      select: { ...summarySelect, body: true },
    });
    await tx.releaseRead.create({
      data: { userId: input.createdByUserId, releaseId: created.id },
    });
    return created;
  });

  const summary = toSummary(row);
  publishReleaseEvent({
    type: "published",
    publishedByUserId: input.createdByUserId,
    release: summary,
  });
  return { ...summary, body: row.body };
}

/**
 * Root-layout payload: one summary query (bodies excluded on purpose) plus the
 * body of the newest unread release for the announcement dialog.
 */
export async function getReleaseInboxForUser(
  userId: string,
): Promise<ReleaseInbox> {
  const rows = await prisma.release.findMany({
    orderBy: [...newestFirst],
    select: {
      ...summarySelect,
      reads: { where: { userId }, select: { releaseId: true } },
    },
  });
  const readIds = new Set(
    rows.filter((row) => row.reads.length > 0).map((row) => row.id),
  );
  const { items, unreadCount, newestUnreadId } = buildReleaseInboxItems(
    rows.map(toSummary),
    readIds,
  );
  const newestUnread =
    newestUnreadId === null ? null : await getReleaseDetail(newestUnreadId);
  return { items, unreadCount, newestUnread };
}

export async function countUnreadReleases(userId: string): Promise<number> {
  return prisma.release.count({ where: { reads: { none: { userId } } } });
}

/** Dismissing the announcement dialog: every unread release becomes read. Returns rows inserted. */
export async function markAllReleasesRead(userId: string): Promise<number> {
  const unread = await prisma.release.findMany({
    where: { reads: { none: { userId } } },
    select: { id: true },
  });
  if (unread.length === 0) {
    return 0;
  }
  const { count } = await prisma.releaseRead.createMany({
    data: unread.map((row) => ({ userId, releaseId: row.id })),
    skipDuplicates: true,
  });
  return count;
}

/** Opening one release from the header list. False when the release does not exist. */
export async function markReleaseRead(
  userId: string,
  releaseId: number,
): Promise<boolean> {
  const exists = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { id: true },
  });
  if (!exists) {
    return false;
  }
  await prisma.releaseRead.upsert({
    where: { userId_releaseId: { userId, releaseId } },
    create: { userId, releaseId },
    update: {},
  });
  return true;
}
