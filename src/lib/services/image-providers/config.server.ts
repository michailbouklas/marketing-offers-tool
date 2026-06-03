import { getImageGeneratorEnv } from "$lib/server/env";
import {
  type ImageGeneratorConfig,
  type ImageModelConfig,
  type ImageProviderConfig,
  SUPPORTED_SIZES,
} from "./config";
import { fetchImageRouterModelCaps } from "./imagerouter-models.server";
import { AUTO_SIZE, CUSTOM_SIZE } from "./model-sizes";

const OPENAI_STANDARD_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;

/**
 * Static capability map for OpenAI image models — OpenAI has no capabilities
 * endpoint, but each model's accepted sizes are fixed and documented.
 */
function openAiModelConfig(id: string): ImageModelConfig {
  const lower = id.toLowerCase();

  if (lower.startsWith("gpt-image-2")) {
    return {
      id,
      sizes: [CUSTOM_SIZE, ...OPENAI_STANDARD_SIZES, AUTO_SIZE],
      supportsQuality: true,
      supportsReferences: true,
      supportsMask: true,
    };
  }
  if (lower.startsWith("gpt-image-1")) {
    return {
      id,
      sizes: [...OPENAI_STANDARD_SIZES, AUTO_SIZE],
      supportsQuality: true,
      supportsReferences: true,
      // gpt-image-1-mini does not support masks; the full model does.
      supportsMask: lower !== "gpt-image-1-mini",
    };
  }
  if (lower.startsWith("dall-e-3")) {
    return {
      id,
      sizes: ["1024x1024", "1792x1024", "1024x1792"],
      supportsQuality: true,
      supportsReferences: false,
      supportsMask: false,
    };
  }
  if (lower.startsWith("dall-e-2")) {
    return {
      id,
      sizes: ["256x256", "512x512", "1024x1024"],
      supportsQuality: false,
      supportsReferences: true,
      supportsMask: true,
    };
  }

  return {
    id,
    sizes: [...SUPPORTED_SIZES],
    supportsQuality: true,
    supportsReferences: true,
    supportsMask: false,
  };
}

export async function buildImageGeneratorConfig(): Promise<ImageGeneratorConfig> {
  const env = getImageGeneratorEnv();
  const providers: ImageProviderConfig[] = [];

  if (env.IMAGE_ROUTER_API_KEY) {
    const caps = await fetchImageRouterModelCaps(env.IMAGE_ROUTER_BASE_URL);
    const models: ImageModelConfig[] = env.IMAGE_ROUTER_MODELS.map((id) => {
      const cap = caps.get(id);
      const sizes =
        cap && cap.sizes.length > 0 ? cap.sizes : [...SUPPORTED_SIZES];
      return {
        id,
        sizes,
        supportsQuality: cap ? cap.quality : true,
        supportsReferences: cap ? cap.image : true,
        supportsMask: cap ? cap.mask : false,
      };
    });
    providers.push({ id: "imagerouter", models });
  }

  if (env.OPENAI_API_KEY) {
    providers.push({
      id: "openai",
      models: env.OPENAI_IMAGE_MODELS.map(openAiModelConfig),
    });
  }

  const availableIds = providers.map((p) => p.id);
  const defaultProvider = availableIds.includes(env.DEFAULT_PROVIDER)
    ? env.DEFAULT_PROVIDER
    : (availableIds[0] ?? null);

  return {
    providers,
    defaultProvider,
    defaultModel: providers.length > 0 ? env.DEFAULT_MODEL : null,
    samplesPerModelMax: env.SAMPLES_PER_MODEL_MAX,
  };
}
