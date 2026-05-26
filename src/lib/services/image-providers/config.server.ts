import { getImageGeneratorEnv } from "$lib/server/env";
import {
  type ImageGeneratorConfig,
  type ImageProviderConfig,
  SUPPORTED_SIZES,
} from "./config";

export function buildImageGeneratorConfig(): ImageGeneratorConfig {
  const env = getImageGeneratorEnv();
  const providers: ImageProviderConfig[] = [];

  if (env.IMAGE_ROUTER_API_KEY) {
    providers.push({
      id: "imagerouter",
      models: env.IMAGE_ROUTER_MODELS,
      sizes: [...SUPPORTED_SIZES],
    });
  }

  if (env.OPENAI_API_KEY) {
    providers.push({
      id: "openai",
      models: env.OPENAI_IMAGE_MODELS,
      sizes: [...SUPPORTED_SIZES],
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
