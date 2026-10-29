/**
 * Builds the app image with the release-notes build identifier baked in.
 *
 *   bun run docker:build [extra docker compose build args]
 *
 * Computes `YYYYMMDD-<sha7>` from the current commit and hands it to
 * `docker compose build` as APP_BUILD_VERSION (consumed by the `args:` block in
 * docker-compose.yml and promoted to a runtime ENV in the Dockerfile). The
 * value cannot be computed inside the build because `.git` is docker-ignored.
 * Works from PowerShell and bash alike; `--dry-run` only prints the version.
 */
import { execSync, spawnSync } from "node:child_process";
import { formatBuildVersion } from "../src/lib/services/releases/release-version.js";

function currentSha(): string {
  try {
    return execSync("git rev-parse --short=7 HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

const args = process.argv.slice(2);
const version = formatBuildVersion(new Date(), currentSha());

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
