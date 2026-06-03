import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type {
  GenerateInput,
  GenerateOutput,
  ImageBackground,
  ImageProvider,
  ImageQuality,
  InputFidelity,
} from "./types";

const OPENAI_BASE_URL = "https://api.openai.com";
const DEFAULT_MODEL = "gpt-image-1";

export class OpenAIProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "OpenAIProviderError";
  }
}

interface OpenAIImageData {
  b64_json?: string;
  url?: string;
}

interface OpenAIImageResponse {
  data?: OpenAIImageData[];
  error?: { message?: string };
}

export interface OpenAIImageProviderOptions {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}

export class OpenAIImageProvider implements ImageProvider {
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: OpenAIImageProviderOptions) {
    this.fetchFn = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl ?? OPENAI_BASE_URL;
  }

  async generateImage(input: GenerateInput): Promise<GenerateOutput> {
    const model = input.model ?? DEFAULT_MODEL;
    const size = `${input.width}x${input.height}`;

    const response = input.references?.length
      ? await this.postEdits({
          model,
          prompt: input.prompt,
          size,
          references: input.references,
          quality: input.quality,
          background: input.background,
          inputFidelity: input.inputFidelity,
        })
      : await this.postGenerations({
          model,
          prompt: input.prompt,
          size,
          quality: input.quality,
          background: input.background,
        });

    if (!response.ok) {
      const body = await safeParseError(response);
      const message =
        body?.error?.message ??
        `OpenAI image request failed: ${response.status} ${response.statusText}`;
      throw new OpenAIProviderError(message, response.status, body);
    }

    const json = (await response.json()) as OpenAIImageResponse;
    const data = json.data?.[0];
    if (!data) {
      throw new OpenAIProviderError(
        "OpenAI image response did not include any data",
        response.status,
        json,
      );
    }

    const bytes = await resolveImageBytes(data, this.fetchFn);
    return {
      bytes,
      providerMetadata: { provider: "openai", model, raw: json },
    };
  }

  private async postGenerations(args: {
    model: string;
    prompt: string;
    size: string;
    quality?: ImageQuality;
    background?: ImageBackground;
  }): Promise<Response> {
    const body: Record<string, unknown> = {
      model: args.model,
      prompt: args.prompt,
      size: args.size,
      n: 1,
    };
    if (args.quality) body.quality = args.quality;
    if (args.background) body.background = args.background;
    // Transparency requires a format that carries an alpha channel.
    if (args.background === "transparent") body.output_format = "png";

    return this.fetchFn(`${this.baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  private async postEdits(args: {
    model: string;
    prompt: string;
    size: string;
    references: string[];
    quality?: ImageQuality;
    background?: ImageBackground;
    inputFidelity?: InputFidelity;
  }): Promise<Response> {
    const form = new FormData();
    form.set("model", args.model);
    form.set("prompt", args.prompt);
    form.set("size", args.size);
    if (args.quality) form.set("quality", args.quality);
    if (args.background) form.set("background", args.background);
    // Transparency requires a format that carries an alpha channel.
    if (args.background === "transparent") form.set("output_format", "png");
    // input_fidelity only applies to image-edit (reference) requests.
    if (args.inputFidelity) form.set("input_fidelity", args.inputFidelity);

    for (const refPath of args.references) {
      const bytes = await readFile(refPath);
      const blob = new Blob([new Uint8Array(bytes)], {
        type: contentTypeFromPath(refPath),
      });
      form.append("image[]", blob, basename(refPath));
    }

    return this.fetchFn(`${this.baseUrl}/v1/images/edits`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: form,
    });
  }
}

async function safeParseError(
  response: Response,
): Promise<OpenAIImageResponse | null> {
  try {
    return (await response.clone().json()) as OpenAIImageResponse;
  } catch {
    return null;
  }
}

async function resolveImageBytes(
  data: OpenAIImageData,
  fetchFn: typeof fetch,
): Promise<Buffer> {
  if (data.b64_json) {
    return Buffer.from(data.b64_json, "base64");
  }
  if (data.url) {
    const res = await fetchFn(data.url);
    if (!res.ok) {
      throw new OpenAIProviderError(
        `Failed to download OpenAI image URL: ${res.status}`,
        res.status,
        null,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  throw new OpenAIProviderError(
    "OpenAI image response is missing both b64_json and url",
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
