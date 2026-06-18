import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * Minimal Vite config for running standalone server scripts with `vite-node`
 * (e.g. `scripts/run-digest.ts`). The full `sveltekit()` plugin cannot service
 * its virtual modules outside a dev/build context, so this config drops it and
 * instead provides the `$lib` alias plus tiny shims for the SvelteKit virtual
 * modules our server code imports:
 *
 *   - `$env/dynamic/private` → `process.env` (with `.env` loaded via dotenv)
 *   - `$app/environment`     → static dev-mode values
 *
 * Used only for scripts; the app itself still builds/runs via `vite.config.ts`.
 */

const root = fileURLToPath(new URL(".", import.meta.url));

const RESOLVED_PREFIX = "\0sk-script-shim:";

const shims: Record<string, string> = {
  "$env/dynamic/private": "export const env = process.env;",
  "$env/dynamic/public": "export const env = process.env;",
  "$app/environment":
    "export const dev = true; export const building = false; export const browser = false; export const version = 'script';",
};

export default defineConfig({
  resolve: {
    alias: {
      $lib: resolve(root, "src/lib"),
    },
  },
  plugins: [
    {
      name: "sveltekit-virtual-shims",
      enforce: "pre",
      resolveId(id) {
        return id in shims ? `${RESOLVED_PREFIX}${id}` : null;
      },
      load(id) {
        return id.startsWith(RESOLVED_PREFIX)
          ? shims[id.slice(RESOLVED_PREFIX.length)]
          : null;
      },
    },
  ],
});
