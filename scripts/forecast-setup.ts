import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// One-time local setup for the Python forecast sidecar (forecast-service/).
//
//   bun run forecast:setup
//
// 1. Makes sure `uv` (https://docs.astral.sh/uv/) is available; installs it with
//    pip when missing.
// 2. Runs `uv sync` inside forecast-service/ (creates .venv from uv.lock).
//    `--foundation` (or `bun run forecast:setup:foundation`) adds the optional TimesFM
//    extra: CPU-only torch + the timesfm package (~750 MB; the 925 MB checkpoint downloads
//    on first use). Pair it with FORECAST_FOUNDATION_ENABLED=1 in .env.
//
// It sets nothing else. For local dev put FORECAST_ALLOW_NO_AUTH=1 in .env
// (see .env.example), then `bun run dev:all`. Docs: docs/forecast-service.md

const isWindows = process.platform === "win32";
const withFoundation = process.argv.includes("--foundation");
const serviceDir = fileURLToPath(
  new URL("../forecast-service/", import.meta.url),
);

function run(cmd: string, args: string[], cwd?: string): number {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: isWindows,
    cwd,
  });
  return result.status ?? 1;
}

function works(cmd: string, args: string[]): boolean {
  const result = spawnSync(cmd, args, { stdio: "pipe", shell: isWindows });
  return result.status === 0;
}

function findPython(): string | null {
  for (const candidate of ["python", "python3", "py"]) {
    if (works(candidate, ["--version"])) return candidate;
  }
  return null;
}

function printInstallHints(): void {
  console.error("\nInstall uv manually and re-run `bun run forecast:setup`:");
  if (isWindows) {
    console.error("  winget install --id=astral-sh.uv -e");
    console.error(
      '  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"',
    );
  } else {
    console.error("  curl -LsSf https://astral.sh/uv/install.sh | sh");
    console.error("  brew install uv");
  }
  console.error(
    "  pip install uv   (then make sure Python's Scripts/bin directory is on PATH)",
  );
}

if (!works("uv", ["--version"])) {
  console.log("uv not found on PATH; trying `pip install uv`...");
  const python = findPython();
  if (!python) {
    console.error(
      "Python 3.12 is not on PATH either. Install Python 3.12, or install uv directly.",
    );
    printInstallHints();
    process.exit(1);
  }
  const status = run(python, ["-m", "pip", "install", "--upgrade", "uv"]);
  if (status !== 0 || !works("uv", ["--version"])) {
    if (status === 0 && works(python, ["-m", "uv", "--version"])) {
      const scripts = spawnSync(
        python,
        ["-c", "import sysconfig; print(sysconfig.get_path('scripts'))"],
        { encoding: "utf8", shell: isWindows },
      ).stdout.trim();
      console.error(
        `uv was installed but is not on PATH. Add this directory to PATH and open a new terminal:\n  ${scripts}`,
      );
    }
    printInstallHints();
    process.exit(1);
  }
}

console.log(
  `uv ready. Syncing Python dependencies in ${serviceDir}${withFoundation ? " (+ foundation extra)" : ""} ...`,
);
const sync = run(
  "uv",
  withFoundation ? ["sync", "--extra", "foundation"] : ["sync"],
  serviceDir,
);
if (sync !== 0) {
  console.error(
    "`uv sync` failed. See the error above; docs/forecast-service.md has troubleshooting notes.",
  );
  process.exit(sync);
}

console.log(`
Forecast service is ready.
  bun run dev:all          start SvelteKit + forecast service together
  bun run forecast:test    run the Python test-suite
Local dev without a token: set FORECAST_ALLOW_NO_AUTH=1 in .env (see .env.example).${
  withFoundation
    ? "\nTimesFM installed: set FORECAST_FOUNDATION_ENABLED=1 in .env to register the model."
    : ""
}`);
