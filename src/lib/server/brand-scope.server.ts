import { RequestContext } from "@mastra/core/request-context";
import { adminRoles, hasAnyRole } from "$lib/auth/roles";
import {
  BRAND_SCOPE_NAMES_RUNTIME_KEY,
  BRAND_SCOPE_RUNTIME_KEY,
} from "$lib/server/mastra/chat-registry";
import { listBrands, listBrandsForUser } from "$lib/services/brands.server";

/** A brand as published to brand-scoped agents: warehouse code + display name. */
export type ScopedBrand = { alias: string; name: string };

export type BrandScopeSubject = {
  id: string;
  /** Comma-separated role list as stored on `user.role`. */
  role: string | null | undefined;
};

export type BrandScope = {
  requestContext: RequestContext;
  brands: ScopedBrand[];
};

/**
 * Publishes the subject's brand scope into a Mastra RequestContext so
 * brand-scoped agents can read it in their dynamic instructions and the SQL
 * tools can enforce it as a hard guardrail (`query-sales-sql.ts` fails closed
 * when the key is missing).
 *
 * The brand list is always derived server-side from the user — never from a
 * request body — so a caller can only ever scope to their own brands.
 * superUser/admin subjects are scoped to ALL active brands instead of their
 * explicit assignments.
 *
 * Lives outside `src/lib/server/mastra/` on purpose: it pulls in Prisma-backed
 * services (and therefore `$env/dynamic/private`), which that directory must
 * avoid so `mastra dev` can bundle it.
 */
export async function buildBrandScopeRequestContext(
  subject: BrandScopeSubject,
  requestContext: RequestContext = new RequestContext(),
): Promise<BrandScope> {
  const brands = hasAnyRole(subject.role, adminRoles)
    ? await listBrands({ active: true })
    : await listBrandsForUser(subject.id);

  // Keep the two arrays index-aligned: a brand without an alias cannot be
  // filtered on in the warehouse, so it is dropped from both lists.
  const scoped: ScopedBrand[] = brands
    .map((brand) => ({ alias: brand.alias.trim(), name: brand.name.trim() }))
    .filter((brand) => brand.alias.length > 0);

  requestContext.set(
    BRAND_SCOPE_RUNTIME_KEY,
    scoped.map((brand) => brand.alias),
  );
  requestContext.set(
    BRAND_SCOPE_NAMES_RUNTIME_KEY,
    scoped.map((brand) => brand.name || brand.alias),
  );

  return { requestContext, brands: scoped };
}
