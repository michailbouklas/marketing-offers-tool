import { parseMktReportParams } from "$lib/services/aggregator-invoices/mkt-report";
import type { MktReportFilters } from "$lib/services/aggregator-invoices/mkt-report.server";
import { resolveBrandProjectCodes } from "$lib/services/brand-project-codes.server";
import { listBrands } from "$lib/services/brands.server";

/** URL → validated params + SQL filters; shared by the page and its export. */
export async function resolveMktReportFilters(url: URL) {
  const requested = parseMktReportParams(url.searchParams);
  const brands = await listBrands({ active: true });
  // Unknown or inactive brand ids (stale URLs) are dropped.
  const brandIds = requested.brands.filter((id) =>
    brands.some((brand) => brand.id === id),
  );
  const params = { ...requested, brands: brandIds };

  const codes = await Promise.all(brandIds.map(resolveBrandProjectCodes));
  const projectCodes =
    brandIds.length === 0
      ? null
      : [...new Set(codes.flatMap((list) => list ?? []))];

  const filters: MktReportFilters = {
    aggregators: params.aggregators,
    stores: params.stores,
    invoiceNumber: params.invoiceNumber,
    lineDetails: params.lineDetails,
    from: params.from,
    to: params.to,
    projectCodes,
  };

  return { params, brands, filters };
}
