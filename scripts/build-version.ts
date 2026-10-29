/**
 * Computes the release-notes build identifier `YYYYMMDD-<sha7>` WITHOUT the
 * git binary, so it can run inside the Docker builder stage where only
 * `.git/HEAD`, `.git/refs/heads/` and `.git/packed-refs` are copied in (see
 * `.dockerignore`). The Dockerfile writes the output to `BUILD_VERSION`, which
 * `getAppBuildVersion()` reads at runtime, so a plain
 * `docker compose up -d --build` stamps the version with no extra step.
 *
 *   bun scripts/build-version.ts            # prints the version
 *   APP_BUILD_VERSION=x bun scripts/...     # prints x (explicit override wins)
 *
 * Also handles a git worktree checkout (where `.git` is a file) for local use.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { formatBuildVersion } from "../src/lib/services/releases/release-version.js";

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** `.git` directory, following a worktree's `gitdir:` pointer file. */
function resolveGitDir(repoRoot: string): string | null {
  const dotGit = join(repoRoot, ".git");
  if (!existsSync(dotGit)) return null;
  if (statSync(dotGit).isDirectory()) return dotGit;
  const pointer = readText(dotGit)
    ?.match(/^gitdir:\s*(.+)$/m)?.[1]
    ?.trim();
  if (!pointer) return null;
  return isAbsolute(pointer) ? pointer : resolve(repoRoot, pointer);
}

/** Where refs live: the main repo's `.git` for a worktree (`commondir` file). */
function resolveCommonDir(gitDir: string): string {
  const common = readText(join(gitDir, "commondir"))?.trim();
  if (!common) return gitDir;
  return isAbsolute(common) ? common : resolve(gitDir, common);
}

function readRef(commonDir: string, ref: string): string | null {
  const loose = readText(join(commonDir, ref))?.trim();
  if (loose) return loose;
  const packed = readText(join(commonDir, "packed-refs"));
  if (!packed) return null;
  for (const line of packed.split(/\r?\n/)) {
    const [sha, name] = line.trim().split(/\s+/);
    if (name === ref && sha && /^[0-9a-f]{40}$/i.test(sha)) return sha;
  }
  return null;
}

/** Full commit sha of HEAD, or "" when no git metadata is available. */
export function readHeadSha(repoRoot: string): string {
  const gitDir = resolveGitDir(repoRoot);
  if (!gitDir) return "";
  const head = readText(join(gitDir, "HEAD"))?.trim();
  if (!head) return "";
  if (/^[0-9a-f]{40}$/i.test(head)) return head; // detached HEAD
  const ref = head.match(/^ref:\s*(.+)$/)?.[1]?.trim();
  if (!ref) return "";
  return readRef(resolveCommonDir(gitDir), ref) ?? "";
}

export function computeBuildVersion(
  repoRoot: string,
  now = new Date(),
): string {
  const override = process.env.APP_BUILD_VERSION?.trim();
  if (override) return override;
  return formatBuildVersion(now, readHeadSha(repoRoot));
}

if (import.meta.main) {
  process.stdout.write(`${computeBuildVersion(dirname(import.meta.dir))}\n`);
}
