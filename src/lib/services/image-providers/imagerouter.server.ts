import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { GenerateInput, GenerateOutput, ImageProvider } from "./types";

const DEFAULT_MODEL = "gpt-image-1";

export class ImageRouterProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "ImageRouterProviderError";
  }
}

interface ImageRouterImageData {
  b64_json?: string;
  url?: string;
}

interface ImageRouterResponse {
  data?: ImageRouterImageData[];
  error?: { message?: string };
}

export interface ImageRouterImageProviderOptions {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
}

export class ImageRouterImageProvider implements ImageProvider {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: ImageRouterImageProviderOptions) {
    this.fetchFn = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
  }

  async generateImage(input: GenerateInput): Promise<GenerateOutput> {
    const model = input.model ?? DEFAULT_MODEL;
    const size = `${input.width}x${input.height}`;

    const form = new FormData();
    form.set("model", model);
    form.set("prompt", input.prompt);
    form.set("size", size);
    form.set("response_format", "b64_json");
    form.set("output_format", "png");
    // Forwarded to the proxied OpenAI-compatible model; models that do not
    // support a given knob simply ignore it.
    if (input.quality) form.set("quality", input.quality);
    if (input.background) form.set("background", input.background);
    if (input.inputFidelity) form.set("input_fidelity", input.inputFidelity);

    for (const refPath of input.references ?? []) {
      const bytes = await readFile(refPath);
      const blob = new Blob([new Uint8Array(bytes)], {
        type: contentTypeFromPath(refPath),
      });
      form.append("image[]", blob, basename(refPath));
    }

    const response = await this.fetchFn(
      `${this.baseUrl}/v1/openai/images/edits`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: form,
      },
    );

    if (!response.ok) {
      const body = await safeParseError(response);
      const message =
        body?.error?.message ??
        `ImageRouter request failed: ${response.status} ${response.statusText}`;
      throw new ImageRouterProviderError(message, response.status, body);
    }

    const json = (await response.json()) as ImageRouterResponse;
    const data = json.data?.[0];
    if (!data) {
      throw new ImageRouterProviderError(
        "ImageRouter response did not include any data",
        response.status,
        json,
      );
    }

    const bytes = await resolveImageBytes(data, this.fetchFn);
    return {
      bytes,
      providerMetadata: { provider: "imagerouter", model, raw: json },
    };
  }
}

async function safeParseError(
  response: Response,
): Promise<ImageRouterResponse | null> {
  try {
    return (await response.clone().json()) as ImageRouterResponse;
  } catch {
    return null;
  }
}

async function resolveImageBytes(
  data: ImageRouterImageData,
  fetchFn: typeof fetch,
): Promise<Buffer> {
  if (data.b64_json) {
    return Buffer.from(data.b64_json, "base64");
  }
  if (data.url) {
    const res = await fetchFn(data.url);
    if (!res.ok) {
      throw new ImageRouterProviderError(
        `Failed to download ImageRouter image URL: ${res.status}`,
        res.status,
        null,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  throw new ImageRouterProviderError(
    "ImageRouter response is missing both b64_json and url",
    200,
    data,
  );
}

function contentTypeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}
