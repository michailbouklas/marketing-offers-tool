/**
 * Build identifier format shared by `scripts/docker-build.ts` (which computes
 * it) and the release-notes UI (which displays it). Browser-safe, pure.
 */

/** Value reported by every local dev server (no Docker build arg). */
export const DEV_BUILD_VERSION = "dev";

/**
 * `YYYYMMDD-<sha7>` in UTC, so two people building the same commit on the same
 * calendar day get the same identifier. Accepts a full hash and truncates it;
 * an empty sha (no git on the build host) yields `nogit`.
 */
export function formatBuildVersion(date: Date, sha: string): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const short = sha.trim().slice(0, 7) || "nogit";
  return `${year}${month}${day}-${short}`;
}
