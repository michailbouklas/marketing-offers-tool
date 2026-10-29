/**
 * Optional helper: builds the app image with an explicit build identifier.
 *
 *   bun run docker:build [extra docker compose build args]
 *
 * Normally unnecessary: the Dockerfile computes `YYYYMMDD-<sha7>` itself from
 * the copied `.git/HEAD` (see scripts/build-version.ts), so a plain
 * `docker compose up -d --build` already stamps the version. Use this when the
 * build context has no git metadata (e.g. an exported tarball) and you want
 * to pass the version from the host, or `--dry-run` to print it.
 */
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { computeBuildVersion } from "./build-version.js";

const args = process.argv.slice(2);
const version = computeBuildVersion(dirname(import.meta.dir));

if (args.includes("--dry-run")) {
  process.stdout.write(`${version}\n`);
  process.exit(0);
}

console.log(`[docker-build] APP_BUILD_VERSION=${version}`);

const result = spawnSync("docker", ["compose", "build", ...args], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, APP_BUILD_VERSION: version },
});

process.exit(result.status ?? 1);
