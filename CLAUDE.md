# marketing-offers-tool

SvelteKit + TypeScript tool for marketing teams to register and manage aggregator offers (Wolt, Bolt, etc.) and track offer performance against aggregator invoices.

## Stack

- **Framework**: SvelteKit (Svelte 5, TypeScript)
- **Styling**: Tailwind CSS v4 (no tailwind.config.js)
- **UI Components**: shadcn-svelte (bits-ui primitives)
- **Forms**: sveltekit-superforms + Zod
- **Auth**: better-auth with PostgreSQL adapter + admin plugin
- **ORM**: Prisma 7 (PostgreSQL)
- **Analytics**: ClickHouse
- **Runtime**: Node.js (bun for package management)

## Project Rules

See `AGENTS.md` for the full technical instruction set. Key constraints:

- ONLY Svelte 5 syntax and runes (`$state`, `$derived`, `$props`)
- ONLY Tailwind CSS v4 syntax
- ALWAYS use shadcn-svelte for UI components — check context7 first
- ALWAYS use sveltekit-superforms + Zod for forms
- ALWAYS use environment variables — no hardcoded values
- ALWAYS run `bun run svelte-autofixer` after code changes
- Prisma: never `db push`, always `migrate`; never destructive migrations without team sign-off

## Architecture

- `src/lib/services/` — shared types + browser-safe client code
- `src/lib/services/*.server.ts` — server-only Prisma / ClickHouse queries
- `src/lib/components/` — UI components (shadcn-svelte + custom)
- `src/routes/` — SvelteKit file-based routing
- `src/lib/server/auth.ts` — Better Auth server instance
- `src/hooks.server.ts` — session resolution + auth redirect on every request

## Plans

See `Plans.md` for current task backlog and status.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **marketing-offers-tool** (3426 symbols, 6301 relationships, 271 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/marketing-offers-tool/context` | Codebase overview, check index freshness |
| `gitnexus://repo/marketing-offers-tool/clusters` | All functional areas |
| `gitnexus://repo/marketing-offers-tool/processes` | All execution flows |
| `gitnexus://repo/marketing-offers-tool/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Work in the Services area (162 symbols) | `.claude/skills/generated/services/SKILL.md` |
| Work in the Server area (94 symbols) | `.claude/skills/generated/server/SKILL.md` |
| Work in the Image-generator area (79 symbols) | `.claude/skills/generated/image-generator/SKILL.md` |
| Work in the Image-providers area (53 symbols) | `.claude/skills/generated/image-providers/SKILL.md` |
| Work in the Inspiration area (52 symbols) | `.claude/skills/generated/inspiration/SKILL.md` |
| Work in the Copywriter area (16 symbols) | `.claude/skills/generated/copywriter/SKILL.md` |
| Work in the Scripts area (13 symbols) | `.claude/skills/generated/scripts/SKILL.md` |
| Work in the Guidelines area (10 symbols) | `.claude/skills/generated/guidelines/SKILL.md` |
| Work in the Text-providers area (10 symbols) | `.claude/skills/generated/text-providers/SKILL.md` |
| Work in the Assets area (6 symbols) | `.claude/skills/generated/assets/SKILL.md` |
| Work in the Brand-context area (6 symbols) | `.claude/skills/generated/brand-context/SKILL.md` |

<!-- gitnexus:end -->
