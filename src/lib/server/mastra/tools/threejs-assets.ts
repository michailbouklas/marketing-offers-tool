import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export interface ThreeAssets {
  /**
   * three.module.min.js with its relative `./three.core.min.js` import
   * rewritten to the bare specifier `three-core`, base64-encoded for the
   * importmap data: URL. Relative specifiers cannot resolve from a data: URL
   * (non-hierarchical base), so the core build gets its own map entry.
   */
  threeModuleBase64: string;
  /** three.core.min.js (the bulk of three), base64 for the `three-core` entry. */
  threeCoreBase64: string;
  /**
   * OrbitControls.js, base64-encoded for a second importmap entry; its own
   * `from "three"` import resolves through the same map.
   */
  orbitControlsBase64: string;
}

let cached: Promise<ThreeAssets> | null = null;

/**
 * Reads the three.js runtime files from node_modules at request time (not via
 * a Vite `?raw` import — the mastra dev playground bundles this directory with
 * its own bundler, same constraint as object-store.ts). The package's exports
 * map does not expose `./build/*`, so the minified modules are located as
 * siblings of the resolved main entry.
 */
export function getThreeAssets(): Promise<ThreeAssets> {
  cached ??= loadThreeAssets().catch((cause) => {
    // Don't cache a failure — a transient FS error should not poison the process.
    cached = null;
    throw cause;
  });
  return cached;
}

async function loadThreeAssets(): Promise<ThreeAssets> {
  const require = createRequire(import.meta.url);
  const buildDir = dirname(require.resolve("three"));
  const [threeModule, threeCore, orbitControls] = await Promise.all([
    readFile(join(buildDir, "three.module.min.js"), "utf8"),
    readFile(join(buildDir, "three.core.min.js")),
    readFile(require.resolve("three/examples/jsm/controls/OrbitControls.js")),
  ]);
  const rewritten = threeModule.split("./three.core.min.js").join("three-core");
  return {
    threeModuleBase64: Buffer.from(rewritten, "utf8").toString("base64"),
    threeCoreBase64: threeCore.toString("base64"),
    orbitControlsBase64: orbitControls.toString("base64"),
  };
}
