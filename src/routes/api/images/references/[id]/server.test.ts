import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("$lib/server/prisma", () => ({
  prisma: {
    referenceImage: { findUnique: vi.fn() },
  },
}));

vi.mock("$lib/server/auth-guards", () => ({
  requireAuthenticatedApiUser: vi.fn(),
}));

const prismaModule = await import("$lib/server/prisma");
const authModule = await import("$lib/server/auth-guards");
const { GET } = await import("./+server");

const requireApiMock =
  authModule.requireAuthenticatedApiUser as unknown as ReturnType<typeof vi.fn>;
const findUniqueMock = (
  prismaModule.prisma as unknown as {
    referenceImage: { findUnique: ReturnType<typeof vi.fn> };
  }
).referenceImage.findUnique;

let workdir: string;
let sourcePath: string;

function makeEvent(id: string) {
  return { params: { id } } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "reference-stream-"));
  sourcePath = join(workdir, "r.png");
  writeFileSync(sourcePath, Buffer.from([1, 2, 3, 4]));
  requireApiMock.mockReturnValue({ session: {}, user: { id: "user-1" } });
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("GET /api/images/references/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    requireApiMock.mockImplementation(() => {
      throw { status: 401 };
    });
    await expect(GET(makeEvent("r"))).rejects.toMatchObject({ status: 401 });
  });

  it("returns 404 when reference is missing", async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(GET(makeEvent("missing"))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("returns 403 when the reference belongs to another user", async () => {
    findUniqueMock.mockResolvedValue({
      id: "r",
      userId: "someone-else",
      localPath: sourcePath,
      contentType: "image/png",
    });
    await expect(GET(makeEvent("r"))).rejects.toMatchObject({ status: 403 });
  });

  it("returns 404 when the file is missing on disk", async () => {
    findUniqueMock.mockResolvedValue({
      id: "r",
      userId: "user-1",
      localPath: join(workdir, "never-existed.png"),
      contentType: "image/png",
    });
    await expect(GET(makeEvent("r"))).rejects.toMatchObject({ status: 404 });
  });

  it("returns 200 with bytes and content-type", async () => {
    findUniqueMock.mockResolvedValue({
      id: "r",
      userId: "user-1",
      localPath: sourcePath,
      contentType: "image/png",
    });
    const res = await GET(makeEvent("r"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.equals(Buffer.from([1, 2, 3, 4]))).toBe(true);
  });
});
