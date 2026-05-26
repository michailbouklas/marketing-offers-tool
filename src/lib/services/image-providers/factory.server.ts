import { getImageGeneratorEnv } from "$lib/server/env";
import { ImageRouterImageProvider } from "./imagerouter.server";
import { OpenAIImageProvider } from "./openai.server";
import type { ImageProvider } from "./types";

export function getImageProvider(providerId: string): ImageProvider {
  const env = getImageGeneratorEnv();

  if (providerId === "openai") {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    return new OpenAIImageProvider({ apiKey: env.OPENAI_API_KEY });
  }

  if (providerId === "imagerouter") {
    if (!env.IMAGE_ROUTER_API_KEY) {
      throw new Error("IMAGE_ROUTER_API_KEY is not configured");
    }
    return new ImageRouterImageProvider({
      apiKey: env.IMAGE_ROUTER_API_KEY,
      baseUrl: env.IMAGE_ROUTER_BASE_URL,
    });
  }

  throw new Error(`Unknown image provider: ${providerId}`);
}
