import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  complianceResultSchema,
  complianceVerdictSchema,
  MAX_RULES_CHARS,
  normalizeComplianceVerdict,
} from "../../../services/image-compliance/image-compliance";
import { IMAGE_COMPLIANCE_AGENT_ID } from "../agents/image-compliance-agent";
import { getObjectStore } from "../object-store";

export const IMAGE_COMPLIANCE_WORKFLOW_ID = "image-compliance-workflow";

/** Longest edge sent to the model; enough for logos/text, cheap on tokens. */
const MAX_EDGE_PX = 1536;
/** sharp refuses to decode anything larger (≈ 7000×7000); protects RAM. */
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * The image is referenced by object-store key, never inlined: workflow run
 * snapshots (inputs + step outputs) are persisted to the Postgres `mastra`
 * schema, so a base64 payload here would be copied into the DB on every run.
 * The API route writes the key before starting the run and removes it after.
 */
const inputSchema = z.object({
  imageKey: z.string().min(1),
  mimeType: z.string().min(1),
  brandName: z.string().min(1),
  rules: z.string().min(1).max(MAX_RULES_CHARS),
});

const preparedSchema = inputSchema.extend({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const prepareImage = createStep({
  id: "prepare-image",
  description:
    "Decode the uploaded image, apply EXIF rotation, downscale and re-encode as JPEG",
  inputSchema,
  outputSchema: preparedSchema,
  execute: async ({ inputData }) => {
    // Lazy so the `mastra dev` bundler never has to resolve the native module.
    const { default: sharp } = await import("sharp");
    const store = getObjectStore();
    const source = await store.get(inputData.imageKey);

    const { data, info } = await sharp(source, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "none",
    })
      .rotate()
      .resize({
        width: MAX_EDGE_PX,
        height: MAX_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });

    await store.put(inputData.imageKey, data, "image/jpeg");

    return {
      ...inputData,
      mimeType: "image/jpeg",
      width: info.width,
      height: info.height,
    };
  },
});

function buildReviewPrompt(brandName: string, rules: string): string {
  return [
    `Brand: ${brandName}`,
    "",
    "COMPLIANCE RULES (markdown):",
    rules,
    "",
    "Review the attached image against these rules and return your verdict in the requested JSON format.",
  ].join("\n");
}

/** Best-effort JSON extraction when the provider ignored the response format. */
function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = /\{[\s\S]*\}/.exec(trimmed);
    if (!match) {
      throw new Error("The model did not return JSON");
    }
    return JSON.parse(match[0]);
  }
}

const analyzeCompliance = createStep({
  id: "analyze-compliance",
  description: "Ask the vision model whether the image follows the guidelines",
  inputSchema: preparedSchema,
  outputSchema: complianceResultSchema,
  // One retry covers a single malformed JSON response or transient provider error.
  retries: 1,
  execute: async ({ inputData, mastra, abortSignal }) => {
    const bytes = await getObjectStore().get(inputData.imageKey);
    const dataUrl = `data:${inputData.mimeType};base64,${bytes.toString("base64")}`;
    const agent = mastra.getAgentById(IMAGE_COMPLIANCE_AGENT_ID);

    const response = await agent.generate(
      [
        {
          role: "user",
          content: [
            { type: "image", image: dataUrl, mimeType: inputData.mimeType },
            {
              type: "text",
              text: buildReviewPrompt(inputData.brandName, inputData.rules),
            },
          ],
        },
      ],
      {
        structuredOutput: { schema: complianceVerdictSchema },
        abortSignal,
        maxSteps: 1,
      },
    );

    // An aborted call resolves with an empty body; don't misreport it as bad JSON.
    if (abortSignal?.aborted) {
      throw new Error("The check was cancelled");
    }

    const raw = response.object ?? parseJsonText(response.text ?? "");
    return normalizeComplianceVerdict(raw, {
      width: inputData.width,
      height: inputData.height,
    });
  },
});

/**
 * One image + one brand's guidelines → compliance verdict. Driven by
 * src/routes/api/image-compliance/check/+server.ts, which streams the step
 * events to the browser.
 */
export const imageComplianceWorkflow = createWorkflow({
  id: IMAGE_COMPLIANCE_WORKFLOW_ID,
  description: "Check a marketing image against brand guidelines",
  inputSchema,
  outputSchema: complianceResultSchema,
})
  .then(prepareImage)
  .then(analyzeCompliance)
  .commit();
