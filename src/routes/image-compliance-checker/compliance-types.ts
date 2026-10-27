import type {
  ComplianceResult,
  ComplianceStepId,
} from "$lib/services/image-compliance/image-compliance";

export type CardStatus = "queued" | "running" | "done" | "error" | "cancelled";

/** Page-local state for one dropped image. Lives and dies with the page. */
export interface ImageEntry {
  id: string;
  file: File;
  /** `URL.createObjectURL(file)`; revoked on remove/reset/destroy. */
  objectUrl: string;
  status: CardStatus;
  step: ComplianceStepId | null;
  startedAt: number | null;
  finishedAt: number | null;
  result: ComplianceResult | null;
  error: string | null;
  controller: AbortController | null;
}
