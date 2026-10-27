import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Workspace files (built-in skills under `skills/`, admin-authored ones under
 * `user-skills/`) live next to the Mastra code. `vite dev` and `node build`
 * both run from the project root, but `mastra dev` runs its bundle from
 * .mastra/output — so walk upward until the directory is found. Override with
 * MASTRA_WORKSPACE_DIR when deploying the build elsewhere (the Dockerfile does).
 *
 * Lives in its own module (not ../index.ts) because the agents need it for
 * their per-assistant skill folders and index.ts imports the agents.
 */
export function workspaceDir(): string {
  const override = process.env.MASTRA_WORKSPACE_DIR;

  if (override) {
    return override;
  }

  let dir = process.cwd();

  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = join(dir, "src", "lib", "server", "mastra", "workspace");

    if (existsSync(candidate)) {
      return candidate;
    }

    dir = dirname(dir);
  }

  return join(process.cwd(), "src", "lib", "server", "mastra", "workspace");
}
