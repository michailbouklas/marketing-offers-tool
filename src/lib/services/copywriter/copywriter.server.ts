import { prisma } from "$lib/server/prisma";
import type { Prisma } from "../../../generated/prisma/client";
import {
  COPY_LIST_DEFAULT_LIMIT,
  COPY_LIST_MAX_LIMIT,
  type GeneratedCopyDTO,
} from "./copywriter";
import { toGeneratedCopyDTO } from "./generate.server";
import type { CopyVariant } from "./types";

export interface ListGeneratedCopiesArgs {
  userId: string;
  limit?: number;
  page?: number;
}

export interface GeneratedCopyPage {
  items: GeneratedCopyDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listGeneratedCopies(
  args: ListGeneratedCopiesArgs,
): Promise<GeneratedCopyPage> {
  const pageSize = Math.min(
    Math.max(args.limit ?? COPY_LIST_DEFAULT_LIMIT, 1),
    COPY_LIST_MAX_LIMIT,
  );
  const page = Math.max(args.page ?? 1, 1);

  const [rows, total] = await Promise.all([
    prisma.generatedCopy.findMany({
      where: { userId: args.userId },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.generatedCopy.count({ where: { userId: args.userId } }),
  ]);

  return {
    items: rows.map(toGeneratedCopyDTO),
    total,
    page,
    pageSize,
  };
}

export async function countGeneratedCopiesForUser(
  userId: string,
): Promise<number> {
  return prisma.generatedCopy.count({ where: { userId } });
}

export class CopyFeedbackError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
    this.name = "CopyFeedbackError";
  }
}

export interface UpdateVariantFeedbackArgs {
  userId: string;
  generatedCopyId: string;
  variantIndex: number;
  rating?: number | null;
  picked?: boolean;
}

/**
 * Updates the per-variant `rating`/`picked` feedback stored inside the
 * variants JSON. Owner-only: the row must belong to the calling user.
 */
export async function updateVariantFeedback(
  args: UpdateVariantFeedbackArgs,
): Promise<GeneratedCopyDTO> {
  const row = await prisma.generatedCopy.findUnique({
    where: { id: args.generatedCopyId },
  });
  if (!row || row.userId !== args.userId) {
    throw new CopyFeedbackError("Generation not found", 404);
  }

  const variants = Array.isArray(row.variants)
    ? (row.variants as unknown as CopyVariant[])
    : [];
  if (
    !Number.isInteger(args.variantIndex) ||
    args.variantIndex < 0 ||
    args.variantIndex >= variants.length
  ) {
    throw new CopyFeedbackError(
      `variantIndex ${args.variantIndex} is out of range`,
    );
  }

  const variant = { ...variants[args.variantIndex] };
  if (args.rating !== undefined) {
    if (
      args.rating !== null &&
      (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5)
    ) {
      throw new CopyFeedbackError("rating must be an integer 1-5 or null");
    }
    variant.rating = args.rating;
  }
  if (args.picked !== undefined) {
    variant.picked = args.picked;
  }
  const next = [...variants];
  next[args.variantIndex] = variant;

  const updated = await prisma.generatedCopy.update({
    where: { id: row.id },
    data: { variants: next as unknown as Prisma.InputJsonValue },
  });
  return toGeneratedCopyDTO(updated);
}
