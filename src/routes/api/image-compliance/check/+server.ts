import { error } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import { requireAuthenticatedApiUser } from "$lib/server/auth-guards";
import { getMastra } from "$lib/server/mastra";
import { IMAGE_COMPLIANCE_WORKFLOW_ID } from "$lib/server/mastra/workflows/image-compliance-workflow";
import { getObjectStore } from "$lib/server/object-store.server";
import { prisma } from "$lib/server/prisma";
import { extensionForContentType } from "$lib/server/reference-storage";
import {
  complianceResultSchema,
  isAllowedImageMime,
  isComplianceStepId,
  MAX_RULES_CHARS,
  MAX_IMAGE_BYTES,
  type ComplianceStreamEvent,
} from "$lib/services/image-compliance/image-compliance";
import type { RequestHandler } from "./$types";

/**
 * POST multipart { file, brandId, rules } → NDJSON stream of
 * ComplianceStreamEvent lines. One request per image: the upload response
 * itself carries the workflow progress (EventSource is GET-only), and the
 * browser aborting the request cancels the workflow run.
 *
 * The image is parked in the object store under a per-user temp key for the
 * duration of the run and removed afterwards. If the process dies mid-run
 * the key leaks under `compliance/<userId>/` — accepted for now.
 */
export const POST: RequestHandler = async (event) => {
  const { user } = requireAuthenticatedApiUser(event);

  let form: FormData;
  try {
    form = await event.request.formData();
  } catch {
    error(400, "Expected a multipart/form-data body");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    error(400, 'Expected an image in the "file" field');
  }
  const mime = file.type.toLowerCase();
  if (mime === "image/heic" || mime === "image/heif") {
    error(
      415,
      "HEIC/HEIF images are not supported. Export the image as JPEG or PNG first.",
    );
  }
  if (!isAllowedImageMime(mime)) {
    error(
      415,
      `Unsupported image type "${file.type || "unknown"}". Use PNG, JPEG or WebP.`,
    );
  }
  if (file.size === 0) {
    error(400, "The image file is empty");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    error(
      413,
      `Image is larger than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB`,
    );
  }

  const brandId = Number.parseInt(String(form.get("brandId") ?? ""), 10);
  if (!Number.isInteger(brandId) || brandId <= 0) {
    error(400, "brandId must be a positive integer");
  }

  const rulesRaw = form.get("rules");
  const rules = typeof rulesRaw === "string" ? rulesRaw.trim() : "";
  if (!rules) {
    error(400, "Compliance rules are required");
  }
  if (rules.length > MAX_RULES_CHARS) {
    error(400, `Compliance rules exceed ${MAX_RULES_CHARS} characters`);
  }

  const assignment = await prisma.user_brand.findUnique({
    where: { userId_brandId: { userId: user.id, brandId } },
    select: { brand: { select: { name: true, active: true } } },
  });
  if (!assignment || !assignment.brand.active) {
    error(403, "Brand is not assigned to this user");
  }

  const extension = extensionForContentType(mime) ?? "bin";
  const imageKey = `compliance/${user.id}/${randomUUID()}.${extension}`;
  const store = getObjectStore();
  await store.put(imageKey, Buffer.from(await file.arrayBuffer()), mime);

  const workflow = getMastra().getWorkflowById(IMAGE_COMPLIANCE_WORKFLOW_ID);
  const run = await workflow.createRun({ resourceId: user.id });
  const output = run.stream({
    inputData: {
      imageKey,
      mimeType: mime,
      brandName: assignment.brand.name,
      rules,
    },
  });
  const startedAt = Date.now();

  const cancelRun = () => {
    void Promise.resolve(run.cancel()).catch(() => {});
  };
  event.request.signal.addEventListener("abort", cancelRun, { once: true });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (payload: ComplianceStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          closed = true;
        }
      };

      try {
        const reader = output.fullStream.getReader();
        for (;;) {
          const { value: chunk, done } = await reader.read();
          if (done) break;
          if (
            chunk.type === "workflow-step-start" &&
            isComplianceStepId(chunk.payload.id)
          ) {
            emit({ type: "step-start", step: chunk.payload.id });
          } else if (
            chunk.type === "workflow-step-result" &&
            isComplianceStepId(chunk.payload.id)
          ) {
            emit({
              type: "step-result",
              step: chunk.payload.id,
              status: chunk.payload.status === "success" ? "success" : "failed",
            });
          }
        }

        const result = await output.result;
        if (result.status === "success") {
          emit({
            type: "done",
            result: complianceResultSchema.parse(result.result),
            durationMs: Date.now() - startedAt,
          });
        } else if ((result.status as string) !== "canceled") {
          emit({ type: "error", message: describeFailure(result) });
        }
      } catch (err) {
        if (!event.request.signal.aborted) {
          emit({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        event.request.signal.removeEventListener("abort", cancelRun);
        await store.remove(imageKey).catch(() => {});
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by a client cancel.
        }
      }
    },
    cancel() {
      cancelRun();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    },
  });
};

function describeFailure(result: { status: string; error?: unknown }): string {
  const err = result.error;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return `The check ended with status "${result.status}"`;
}
