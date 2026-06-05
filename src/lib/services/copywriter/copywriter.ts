import type { CopyType, CopyVariant } from "./types";

export type GeneratedCopyStatus = "completed" | "failed";

export interface GeneratedCopyDTO {
  id: string;
  brandId: number | null;
  offerId: number | null;
  copyType: CopyType;
  channel: string;
  brief: string;
  tone: string | null;
  finalPrompt: string;
  provider: string;
  model: string | null;
  variants: CopyVariant[];
  status: GeneratedCopyStatus;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export const COPY_LIST_DEFAULT_LIMIT = 20;
export const COPY_LIST_MAX_LIMIT = 100;
