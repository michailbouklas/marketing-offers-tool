import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestEvent } from "@sveltejs/kit";

vi.mock("$lib/server/env", () => ({
  getImageGeneratorEnv: vi.fn(),
}));

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    referenceImage: {
      create: vi.fn(),
    },
  },
}));

const envModule = await import("$lib/server/env");
const prismaModule = await import("$lib/server/prisma");
const { POST } = await import("./+server");

const mockEnv = envModule.getImageGeneratorEnv as unknown as ReturnType<
  typeof vi.fn
>;
const createMock = prismaModule.prisma.referenceImage
  .create as unknown as ReturnType<typeof vi.fn>;

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "api-references-"));
  mockEnv.mockReturnValue({
    IMAGE_ROUTER_API_KEY: undefined,
    IMAGE_ROUTER_BASE_URL: "https://api.imagerouter.io",
    IMAGE_ROUTER_MODELS: [],
    OPENAI_API_KEY: undefined,
    OPENAI_IMAGE_MODELS: [],
    DEFAULT_PROVIDER: "imagerouter",
    DEFAULT_MODEL: "gpt-image-1",
    UPLOADS_DIR: workdir,
    SAMPLES_PER_MODEL_MAX: 5,
  });
  createMock.mockImplementation(async ({ data }: { data: unknown }) => data);
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function buildEvent(
  form: FormData,
  overrides: Partial<RequestEvent["locals"]> = {},
): RequestEvent {
  const request = new Request("http://localhost/api/images/references", {
    method: "POST",
    body: form,
  });
  return {
    locals: {
      session: { id: "session-1", userId: "user-1" },
      user: { id: "user-1", email: "x@example.com" },
      ...overrides,
    },
    url: new URL("http://localhost/api/images/references"),
    request,
  } as unknown as RequestEvent;
}

function fileFor(
  contentType: string,
  bytes: Buffer,
  filename = "ref.bin",
): File {
  return new File([new Uint8Array(bytes)], filename, { type: contentType });
}

describe("POST /api/images/references", () => {
  it("returns 401 when unauth", async () => {
    const form = new FormData();
    form.append("files", fileFor("image/png", Buffer.from("X")));

    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent(form, { session: null, user: null }),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 400 when no files are attached", async () => {
    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent(new FormData()),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(400);
  });

  it("returns 400 when any file has a non-image content type", async () => {
    const form = new FormData();
    form.append("files", fileFor("image/png", Buffer.from("PNG")));
    form.append("files", fileFor("application/json", Buffer.from("{}")));

    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent(form),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("persists each uploaded image, returns id + contentType, scoped to current user", async () => {
    const form = new FormData();
    form.append(
      "files",
      fileFor("image/png", Buffer.from("PNG-bytes"), "a.png"),
    );
    form.append(
      "files",
      fileFor("image/webp", Buffer.from("WEBP-bytes"), "b.webp"),
    );

    const response = await (POST as (e: RequestEvent) => Promise<Response>)(
      buildEvent(form),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ contentType: "image/png" });
    expect(body[1]).toMatchObject({ contentType: "image/webp" });
    expect(typeof body[0].id).toBe("string");
    expect(typeof body[1].id).toBe("string");
    expect(body[0].id).not.toBe(body[1].id);

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[0]![0].data.userId).toBe("user-1");
    expect(createMock.mock.calls[1]![0].data.userId).toBe("user-1");

    const firstFile = join(workdir, "references", `${body[0].id}.png`);
    const secondFile = join(workdir, "references", `${body[1].id}.webp`);
    expect(existsSync(firstFile)).toBe(true);
    expect(existsSync(secondFile)).toBe(true);
    expect(readFileSync(firstFile).toString("utf8")).toBe("PNG-bytes");
    expect(readFileSync(secondFile).toString("utf8")).toBe("WEBP-bytes");
  });
});
