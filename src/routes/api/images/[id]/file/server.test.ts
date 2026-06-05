import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RequestEvent } from "@sveltejs/kit";

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    generatedImage: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("$lib/server/env", () => ({
  getImageGeneratorEnv: vi.fn(),
  getStorageEnv: vi.fn(() => ({})),
}));

const prismaModule = await import("$lib/server/prisma");
const envModule = await import("$lib/server/env");
const { GET } = await import("./+server");

const findUniqueMock = prismaModule.prisma.generatedImage
  .findUnique as unknown as ReturnType<typeof vi.fn>;
const mockEnv = envModule.getImageGeneratorEnv as unknown as ReturnType<
  typeof vi.fn
>;

let workdir: string;
const IMAGE_KEY = "images/img-1.png";
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "api-file-"));
  mkdirSync(join(workdir, "images"), { recursive: true });
  writeFileSync(join(workdir, "images", "img-1.png"), PNG_BYTES);
  mockEnv.mockReturnValue({ UPLOADS_DIR: workdir });
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
  vi.clearAllMocks();
});

function buildEvent(
  id: string,
  overrides: Partial<RequestEvent["locals"]> = {},
): RequestEvent {
  return {
    locals: {
      session: { id: "session-1", userId: "user-1" },
      // `role` is set so the cross-user branch resolves the role from locals
      // instead of falling back to a raw DB query.
      user: { id: "user-1", email: "x@example.com", role: "user" },
      ...overrides,
    },
    url: new URL(`http://localhost/api/images/${id}/file`),
    params: { id },
    request: new Request(`http://localhost/api/images/${id}/file`),
  } as unknown as RequestEvent;
}

describe("GET /api/images/[id]/file", () => {
  it("returns 401 when unauth", async () => {
    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent("img-1", { session: null, user: null }),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(401);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the row does not exist", async () => {
    findUniqueMock.mockResolvedValue(null);

    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent("missing-id"),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(404);
  });

  it("returns 403 when the row belongs to a different user", async () => {
    findUniqueMock.mockResolvedValue({
      id: "img-1",
      userId: "user-2",
      status: "completed",
      localPath: IMAGE_KEY,
    });

    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent("img-1"),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(403);
  });

  it("streams another user's image when the viewer is a super user", async () => {
    findUniqueMock.mockResolvedValue({
      id: "img-1",
      userId: "user-2",
      status: "completed",
      localPath: IMAGE_KEY,
    });

    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent("img-1", {
        user: { id: "user-1", email: "x@example.com", role: "superUser" },
      } as Partial<RequestEvent["locals"]>),
    );

    expect(response.status).toBe(200);
    const buf = Buffer.from(await response.arrayBuffer());
    expect(buf.equals(PNG_BYTES)).toBe(true);
  });

  it("returns 404 when the row is still pending", async () => {
    findUniqueMock.mockResolvedValue({
      id: "img-1",
      userId: "user-1",
      status: "pending",
      localPath: null,
    });

    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent("img-1"),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(404);
  });

  it("returns 404 when the object is missing from the store", async () => {
    findUniqueMock.mockResolvedValue({
      id: "img-1",
      userId: "user-1",
      status: "completed",
      localPath: "images/does-not-exist.png",
    });

    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent("img-1"),
    ).catch((thrown: Response) => thrown);

    expect(response.status).toBe(404);
  });

  it("streams bytes with the correct content-type when authorized", async () => {
    findUniqueMock.mockResolvedValue({
      id: "img-1",
      userId: "user-1",
      status: "completed",
      localPath: IMAGE_KEY,
    });

    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent("img-1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe(
      String(PNG_BYTES.length),
    );
    const buf = Buffer.from(await response.arrayBuffer());
    expect(buf.equals(PNG_BYTES)).toBe(true);
  });

  it("streams legacy uploads paths with Windows separators", async () => {
    findUniqueMock.mockResolvedValue({
      id: "img-1",
      userId: "user-1",
      status: "completed",
      localPath: "uploads\\images\\img-1.png",
    });

    const response = await (GET as (e: RequestEvent) => Promise<Response>)(
      buildEvent("img-1"),
    );

    expect(response.status).toBe(200);
    const buf = Buffer.from(await response.arrayBuffer());
    expect(buf.equals(PNG_BYTES)).toBe(true);
  });
});
