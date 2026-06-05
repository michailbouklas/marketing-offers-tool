import { getImageGeneratorEnv } from "$lib/server/env";
import { OpenAITextProvider } from "./openai.server";
import type { TextProvider } from "./types";

export function getTextProvider(providerId: string): TextProvider {
  const env = getImageGeneratorEnv();

  if (providerId === "openai") {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    return new OpenAITextProvider({ apiKey: env.OPENAI_API_KEY });
  }

  throw new Error(`Unknown text provider: ${providerId}`);
}
