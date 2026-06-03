import { env } from "$env/dynamic/private";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const globalForEnv = globalThis as typeof globalThis & {
  imageGeneratorEnvCache?: ImageGeneratorEnv;
  imageGeneratorEnvFileValues?: Record<string, string>;
  imageGeneratorEnvWarned?: boolean;
};

function loadEnvFileValues(): Record<string, string> {
  const envFilePath = join(process.cwd(), ".env");

  if (!existsSync(envFilePath)) {
    return {};
  }

  const fileContents = readFileSync(envFilePath, "utf8");
  const values: Record<string, string> = {};

  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function readEnv(name: string): string | undefined {
  globalForEnv.imageGeneratorEnvFileValues ??= loadEnvFileValues();

  const value =
    globalForEnv.imageGeneratorEnvFileValues[name] ??
    process.env[name] ??
    env[name as keyof typeof env];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return value;
}

const csvList = z
  .string()
  .optional()
  .transform((raw) =>
    raw
      ? raw
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [],
  );

const positiveInt = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (raw === undefined) {
      return undefined;
    }

    const parsed = Number.parseInt(raw, 10);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Expected a positive integer, received "${raw}"`,
      });
      return z.NEVER;
    }

    return parsed;
  });

const providerName = z.enum(["imagerouter", "openai"]);

const imageGeneratorEnvSchema = z.object({
  IMAGE_ROUTER_API_KEY: z.string().optional(),
  IMAGE_ROUTER_BASE_URL: z
    .string()
    .url()
    .optional()
    .transform((value) => value ?? "https://api.imagerouter.io"),
  IMAGE_ROUTER_MODELS: csvList,
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_IMAGE_MODELS: csvList,
  DEFAULT_PROVIDER: providerName
    .optional()
    .transform((value) => value ?? "imagerouter"),
  DEFAULT_MODEL: z
    .string()
    .optional()
    .transform((value) => value ?? "gpt-image-1"),
  UPLOADS_DIR: z
    .string()
    .optional()
    .transform((value) => value ?? "./uploads"),
  SAMPLES_PER_MODEL_MAX: positiveInt.transform((value) => value ?? 5),
});

export type ImageGeneratorEnv = z.infer<typeof imageGeneratorEnvSchema>;

function loadImageGeneratorEnv(): ImageGeneratorEnv {
  const raw = {
    IMAGE_ROUTER_API_KEY: readEnv("IMAGE_ROUTER_API_KEY"),
    IMAGE_ROUTER_BASE_URL: readEnv("IMAGE_ROUTER_BASE_URL"),
    IMAGE_ROUTER_MODELS: readEnv("IMAGE_ROUTER_MODELS"),
    OPENAI_API_KEY: readEnv("OPENAI_API_KEY"),
    OPENAI_IMAGE_MODELS: readEnv("OPENAI_IMAGE_MODELS"),
    DEFAULT_PROVIDER: readEnv("DEFAULT_PROVIDER"),
    DEFAULT_MODEL: readEnv("DEFAULT_MODEL"),
    UPLOADS_DIR: readEnv("UPLOADS_DIR"),
    SAMPLES_PER_MODEL_MAX: readEnv("SAMPLES_PER_MODEL_MAX"),
  };

  const result = imageGeneratorEnvSchema.safeParse(raw);

  if (!result.success) {
    console.warn(
      "[image-generator] Invalid env configuration; falling back to defaults.",
      result.error.flatten().fieldErrors,
    );
    return imageGeneratorEnvSchema.parse({});
  }

  if (!globalForEnv.imageGeneratorEnvWarned) {
    if (!result.data.IMAGE_ROUTER_API_KEY) {
      console.warn(
        "[image-generator] IMAGE_ROUTER_API_KEY is not set — ImageRouter provider will be disabled.",
      );
    }
    if (!result.data.OPENAI_API_KEY) {
      console.warn(
        "[image-generator] OPENAI_API_KEY is not set — OpenAI provider and prompt enhancement will be disabled.",
      );
    }
    globalForEnv.imageGeneratorEnvWarned = true;
  }

  return result.data;
}

export function getImageGeneratorEnv(): ImageGeneratorEnv {
  globalForEnv.imageGeneratorEnvCache ??= loadImageGeneratorEnv();
  return globalForEnv.imageGeneratorEnvCache;
}

export function hasImageRouterProvider(): boolean {
  return Boolean(getImageGeneratorEnv().IMAGE_ROUTER_API_KEY);
}

export function hasOpenAIProvider(): boolean {
  return Boolean(getImageGeneratorEnv().OPENAI_API_KEY);
}

export function resetImageGeneratorEnvForTesting(): void {
  globalForEnv.imageGeneratorEnvCache = undefined;
  globalForEnv.imageGeneratorEnvFileValues = undefined;
  globalForEnv.imageGeneratorEnvWarned = undefined;
}

/**
 * Supabase Storage configuration for the shared object store. When all three
 * values are present the app stores image/reference/brand bytes in the
 * Supabase bucket (shared across every machine that talks to the same
 * database); when they are absent it falls back to local-filesystem storage
 * under `UPLOADS_DIR` (dev + tests). See `object-store.server.ts`.
 */
export interface StorageEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_STORAGE_BUCKET?: string;
}

export function getStorageEnv(): StorageEnv {
  return {
    SUPABASE_URL: readEnv("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_STORAGE_BUCKET: readEnv("SUPABASE_STORAGE_BUCKET"),
  };
}

export function hasSupabaseStorage(): boolean {
  const env = getStorageEnv();
  return Boolean(
    env.SUPABASE_URL &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    env.SUPABASE_STORAGE_BUCKET,
  );
}
