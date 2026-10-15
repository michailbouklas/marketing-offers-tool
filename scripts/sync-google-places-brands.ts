import { config } from "dotenv";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

config(); // load .env

// One-shot sync of this app's `brand` table into the Google Reviews scraper
// API (`GOOGLE_PLACES_API`, `/brands`). The scraper keeps its own brands
// table and `scrape_queries.brand_id` points at it, so the Places manager's
// brand dropdown only shows what exists there.
//
// Matching is deliberately loose because the two tables were created by hand
// independently (remote `paul` vs our `paul-international`, remote `nero` vs
// our `caffe-nero`): a local brand counts as already present when its slug,
// alias or name matches a remote slug or title (case-insensitive). Only
// brands with no match are created; nothing is updated or deleted.
//
//   bun scripts/sync-google-places-brands.ts --dry-run       # report only
//   bun scripts/sync-google-places-brands.ts                 # create missing
//   bun scripts/sync-google-places-brands.ts --include-inactive

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const includeInactive = args.includes("--include-inactive");

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PAGE_SIZE = 100;

type RemoteBrand = { id: number; title: string; slug: string };

type LocalBrand = {
  id: number;
  name: string;
  alias: string;
  slug: string;
  description: string | null;
  logo: string;
  active: boolean;
  google_places_brand_id: number | null;
};

function normaliseBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
  return (hasProtocol ? trimmed : `http://${trimmed}`).replace(/\/+$/, "");
}

const baseUrl = normaliseBaseUrl(process.env.GOOGLE_PLACES_API);
if (!baseUrl) {
  console.error("GOOGLE_PLACES_API is not set in .env.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set in .env.");
  process.exit(1);
}

/** Lowercase, trimmed key used for every comparison. */
function key(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Reads the API's error body in either of the shapes it emits. */
async function readError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const body = JSON.parse(text) as {
      message?: string;
      error?: boolean | { message?: string };
    };
    if (typeof body.error === "object" && body.error?.message) {
      return body.error.message;
    }
    if (body.message) {
      return body.message;
    }
  } catch {
    // not JSON
  }
  return text || `HTTP ${response.status}`;
}

async function fetchRemoteBrands(): Promise<RemoteBrand[]> {
  const brands: RemoteBrand[] = [];
  let offset = 0;

  for (;;) {
    const url = new URL(`${baseUrl}/brands`);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("order_by", "slug");
    url.searchParams.set("order_direction", "ASC");

    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`GET /brands failed: ${await readError(response)}`);
    }

    const body = (await response.json()) as {
      data?: RemoteBrand[];
      pagination?: { total?: number; hasMore?: boolean };
    };
    const page = body.data ?? [];
    brands.push(
      ...page.map((brand) => ({
        id: brand.id,
        title: brand.title,
        slug: brand.slug,
      })),
    );

    offset += page.length;
    const total = body.pagination?.total;
    const hasMore =
      body.pagination?.hasMore ??
      (total !== undefined ? offset < total : page.length === PAGE_SIZE);
    if (!hasMore || page.length === 0) {
      break;
    }
  }

  return brands;
}

async function createRemoteBrand(payload: {
  title: string;
  slug: string;
  description?: string;
  logo_url?: string;
}): Promise<RemoteBrand> {
  const response = await fetch(`${baseUrl}/brands`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const body = (await response.json()) as { data?: RemoteBrand };
  if (!body.data) {
    throw new Error("API did not return the created brand.");
  }
  return body.data;
}

function findMatch(
  local: LocalBrand,
  remote: RemoteBrand[],
): RemoteBrand | undefined {
  const candidates = new Set(
    [local.slug, local.alias, local.name, slugify(local.name)]
      .map(key)
      .filter((value) => value.length > 0),
  );

  return remote.find(
    (brand) =>
      candidates.has(key(brand.slug)) || candidates.has(key(brand.title)),
  );
}

function buildPayload(local: LocalBrand) {
  const title = local.name.trim();
  const slug = key(local.slug) || slugify(title);

  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`slug "${slug}" is not URL-safe (lowercase, hyphens only)`);
  }

  const description = local.description?.trim();
  const logo = local.logo.trim();

  return {
    title,
    slug,
    ...(description ? { description } : {}),
    ...(/^https?:\/\//i.test(logo) ? { logo_url: logo } : {}),
  };
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

let mapped = 0;

/**
 * Stores the remote id on the local brand (`brand.google_places_brand_id`) so
 * the app can translate a place's scraper brand into an app brand. Skipped when
 * already equal; a unique-constraint clash (two local brands matching the same
 * remote brand) is reported, not fatal.
 */
async function recordMapping(local: LocalBrand, remoteId: number) {
  if (local.google_places_brand_id === remoteId) {
    return;
  }

  if (dryRun) {
    console.log(
      `    ~ would store mapping #${local.id} -> remote #${remoteId}`,
    );
    mapped += 1;
    return;
  }

  try {
    await prisma.brand.update({
      where: { id: local.id },
      data: { google_places_brand_id: remoteId },
    });
    mapped += 1;
    console.log(`    ~ stored mapping #${local.id} -> remote #${remoteId}`);
  } catch (error) {
    console.error(
      `    ! could not store mapping #${local.id} -> remote #${remoteId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

try {
  const [localBrands, remoteBrands] = await Promise.all([
    prisma.brand.findMany({
      where: includeInactive ? {} : { active: true },
      select: {
        id: true,
        name: true,
        alias: true,
        slug: true,
        description: true,
        logo: true,
        active: true,
        google_places_brand_id: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    fetchRemoteBrands(),
  ]);

  console.log(
    `Local brands: ${localBrands.length}${includeInactive ? "" : " (active only)"}. Remote brands at ${baseUrl}: ${remoteBrands.length}.`,
  );

  const missing: LocalBrand[] = [];
  for (const local of localBrands) {
    const match = findMatch(local, remoteBrands);
    if (match) {
      console.log(
        `  = ${local.name.trim()} (#${local.id}) -> remote "${match.title}" [${match.slug}] (#${match.id})`,
      );
      await recordMapping(local, match.id);
    } else {
      missing.push(local);
    }
  }

  if (missing.length === 0) {
    console.log(
      "Nothing to create; every local brand already exists remotely.",
    );
  } else {
    console.log(`\n${missing.length} brand(s) missing remotely:`);
  }

  let created = 0;
  let failed = 0;

  for (const local of missing) {
    let payload: ReturnType<typeof buildPayload>;
    try {
      payload = buildPayload(local);
    } catch (error) {
      failed += 1;
      console.error(
        `  ! ${local.name.trim()} (#${local.id}): ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    if (dryRun) {
      console.log(
        `  + would create "${payload.title}" [${payload.slug}]${payload.description ? " with description" : ""}${payload.logo_url ? " with logo" : ""}`,
      );
      continue;
    }

    try {
      const remote = await createRemoteBrand(payload);
      created += 1;
      console.log(
        `  + created "${remote.title}" [${remote.slug}] -> remote #${remote.id}`,
      );
      await recordMapping(local, remote.id);
    } catch (error) {
      failed += 1;
      console.error(
        `  ! ${payload.title} [${payload.slug}]: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(
    dryRun
      ? `\nDry run: ${missing.length - failed} would be created, ${failed} skipped, ${mapped} mapping(s) would be stored.`
      : `\nDone: ${created} created, ${failed} failed, ${localBrands.length - missing.length} already present, ${mapped} mapping(s) stored.`,
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
  await pool.end();
}
