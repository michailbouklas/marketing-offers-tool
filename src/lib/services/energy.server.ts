import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import type { EnergyCost } from "$lib/services/recipes";

// The value only changes on the 1st (window = last 3 full months), and a call
// takes seconds, so cache per brand per month. Errors are never cached.
const cache = new Map<string, EnergyCost>();

/**
 * GET {ENERGY_API_URL}/api/public/brands/{name}/pre-vat-cost-percent.
 * Unknown brand → 404; missing config, outage or timeout → 503.
 */
export async function getEnergyCostPercent(
  brandName: string,
): Promise<EnergyCost> {
  const baseUrl = env.ENERGY_API_URL?.replace(/\/+$/, "");
  const token = env.ENERGY_API_TOKEN;
  if (!baseUrl || !token) error(503, "Energy platform is not configured");

  const key = `${brandName.toLowerCase()}|${new Date().toISOString().slice(0, 7)}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl}/api/public/brands/${encodeURIComponent(brandName)}/pre-vat-cost-percent`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch (cause) {
    console.error("Energy platform request failed", cause);
    error(503, "Energy platform unavailable");
  }

  if (response.status === 404) {
    error(404, `Brand "${brandName}" not found on the energy platform`);
  }
  if (!response.ok) {
    console.error(`Energy platform returned ${response.status}`);
    error(503, "Energy platform unavailable");
  }

  const body = (await response.json()) as Partial<EnergyCost>;
  const result: EnergyCost = {
    percent:
      typeof body.percent === "number" && Number.isFinite(body.percent)
        ? body.percent
        : null,
    from: String(body.from ?? ""),
    to: String(body.to ?? ""),
  };
  cache.set(key, result);
  return result;
}
