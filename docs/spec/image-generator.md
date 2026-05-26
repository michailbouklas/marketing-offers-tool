# Image Generator — Feature Spec

**Status**: draft (revised after prototype review)
**Owner**: marketing-offers-tool
**Created**: 2026-05-26
**Last revised**: 2026-05-26

## Purpose

Give marketing users a familiar chat-style UI to generate images from prompts, using configurable AI providers (initially ImageRouter and OpenAI). Generated images and their parameters are persisted so users can review and re-prompt later. This spec describes the **integrated SvelteKit product**, not the standalone prototype it draws from.

## Scope (v1)

### Route

- `/image-generator` — authenticated, all logged-in users (same gating as `/aggregator-offers`).
- API: see [API surface](#api-surface) below.

### UI behavior

- **Prompt box**: multi-line textarea + submit button. Generated images render in a responsive grid below, newest first.
- **Provider select**: ImageRouter and OpenAI. Providers without an API key in env are hidden from the dropdown (new behavior vs. prototype, driven by `GET /api/images/config`).
- **Model select**: depends on provider. Populated from `IMAGE_ROUTER_MODELS` / `OPENAI_IMAGE_MODELS` env CSVs surfaced via `/api/images/config`. Resets when provider changes.
- **Image Size dropdown**: `1024x1024`, `1536x1024`, `1024x1536`. Parsed server-side as `WxH`; `auto` not supported in v1.
- **Camera dropdown**: `none`, `close-up top-down shot`, `35mm perspective`, `macro shot`. Selection appended to the prompt before enhancement (matches prototype values).
- **Style dropdown**: `none`, `photorealistic`, `illustration`, `cartoon`, `cinematic`. Appended to the prompt before enhancement.
- **Aspect Ratio dropdown**: `square` → `1024x1024`, `widescreen` → `1536x1024`, `tiktok` → `1024x1536`. Selecting an aspect ratio overrides the explicit Image Size value (matches prototype).
- **Enhance prompt** checkbox (default on): when enabled and the request is not coming from "Edit → re-prompt with reference", the client calls `POST /api/images/enhance` first. The enhancement endpoint may return clarifying questions; the UI surfaces them and the user can answer or skip. The accepted enhanced prompt becomes the prompt sent to generation. When disabled (or when editing with a reference image), the raw prompt is sent as-is.
- **Reference images upload**: multipart upload to `POST /api/images/references`, returns reference IDs. IDs are passed as `references[]` to `/api/images/generate`. Stored under `${UPLOADS_DIR}/references/`.
- **All Models** checkbox: when enabled, ignores the Model select and fans out **3 parallel requests per configured model** for the selected provider. (Prototype sends 1 per model; v1 raises this to 3.) Optional `samplesPerModel` numeric input next to the checkbox, default `3`, range `1..5`.
- **Per-image actions**:
  - **Download**: streams from `GET /api/images/[id]/file`.
  - **Edit**: opens a small menu with two options:
    - **Re-prompt** — repopulates `PromptComposer` with this row's prompt + selections; does not call the provider.
    - **Edit with reference image** — pre-selects this image as a `references[]` entry on the next generation request (matches prototype's current Edit behavior). Prompt enhancement is skipped for this flow.
- **Skeleton cards + per-card timer**: in-flight rows show a skeleton with model label and a live count-up timer formatted as `s.t` seconds (one decimal place, matches prototype). Polling stops when no rows are `pending`.

### Final prompt construction

Two-stage. Both stages persist their output.

1. **Client-side enrichment** (before optional enhancement): the client prepends style/camera/aspect annotations to the user prompt as:
   ```
   Style: <style>. Camera: <camera>. Aspect ratio: <aspect>. <userPrompt>
   ```
   Values set to `none` are omitted from this string.
2. **Optional prompt enhancement**: when "Enhance prompt" is on and no reference image is attached, `POST /api/images/enhance` (OpenAI chat completions) may ask clarifying questions and then return an enriched prompt. The accepted enriched prompt becomes the input to generation.

Persisted fields:

- `prompt` — raw user-entered text (before client enrichment).
- `finalPrompt` — exact string sent to the image provider (after enrichment + optional enhancement).

> **Brand pipeline removed for v1.** The prototype's `buildPrompt` brand rules, `brand-kits/<name>.json`, logo overlay, headline overlay, and custom font upload are **not** in scope. Tracked as a future phase. Headline input and brand-kit selectors are not exposed in the v1 UI.

### Provider abstraction

Matches the prototype's working shape; extended with optional metadata.

```ts
interface GenerateInput {
  prompt: string;
  width: number;
  height: number;
  model?: string;
  references?: string[]; // local absolute paths to reference image files
}

interface GenerateOutput {
  bytes: Buffer;
  providerMetadata?: unknown;
}

interface ImageProvider {
  generateImage(input: GenerateInput): Promise<GenerateOutput>;
}
```

File locations in the integrated app:

- `src/lib/services/image-providers/types.ts` — interface.
- `src/lib/services/image-providers/openai.server.ts`
- `src/lib/services/image-providers/imagerouter.server.ts`

(File names use the SvelteKit `.server.ts` convention. The prototype's `src/providers/*.ts` files are the porting source, not the destination.)

### Provider posting details

#### ImageRouter

- Auth: `IMAGE_ROUTER_API_KEY`. Base URL from `IMAGE_ROUTER_BASE_URL` (default `https://api.imagerouter.io`).
- Endpoint: `POST ${IMAGE_ROUTER_BASE_URL}/v1/openai/images/edits` (multipart). Used for both text-to-image and reference-image flows — matches prototype.
- Fields: `model` (request model | `DEFAULT_MODEL` | `gpt-image-1`), `prompt`, `size` = `${width}x${height}`, `response_format=b64_json`, `output_format=png`, `image[]` for each reference.
- Response: accepts `b64_json` or `url`.

#### OpenAI

- Auth: `OPENAI_API_KEY`.
- Text-to-image (no references): `POST https://api.openai.com/v1/images/generations` (JSON). Fields: `model`, `prompt`, `size`, `n=1`. Model defaults to `gpt-image-1`.
- Reference-image: `POST https://api.openai.com/v1/images/edits` (multipart). Fields: `model`, `prompt`, `size`, `image[]` for each reference.
- Response: accepts `b64_json` or `url`.

### Size handling

- Server parses requested sizes as `WxH`. Missing / invalid components default to `1024`.
- Before posting, server maps requested size to nearest supported generation dimensions per provider (provider-specific list; for v1 both providers share `1024x1024`, `1536x1024`, `1024x1536`).
- After generation, server resizes back to the originally requested dimensions with `sharp`.
- Both the requested size (`requestedWidth/Height`) and the actual provider generation size (`generationWidth/Height`) are persisted.

### Persistence

```prisma
model GeneratedImage {
  id               String   @id @default(cuid())
  userId           String
  prompt           String   // raw user-entered prompt
  finalPrompt      String   // exact string sent to provider
  provider         String
  model            String?
  requestedWidth   Int
  requestedHeight  Int
  generationWidth  Int
  generationHeight Int
  style            String?
  camera           String?
  aspectRatio      String?
  referenceIds     Json     // string[] of ReferenceImage.id; [] when none
  localPath        String?  // relative to UPLOADS_DIR
  remoteUrl        String?  // provider URL when returned; may expire
  status           String   // 'pending' | 'completed' | 'failed'
  errorMessage     String?
  durationMs       Int?
  createdAt        DateTime @default(now())

  @@index([userId, createdAt])
}

model ReferenceImage {
  id          String   @id @default(cuid())
  userId      String
  localPath   String   // relative to UPLOADS_DIR
  contentType String
  createdAt   DateTime @default(now())

  @@index([userId, createdAt])
}
```

Files:

- Final images: `${UPLOADS_DIR}/images/${id}.png`.
- Reference images: `${UPLOADS_DIR}/references/${id}.${ext}`.

`UPLOADS_DIR` is required env; not hardcoded. Defaults to `./uploads` in dev only via `.env.example`. Document the deploy volume mount during the polish phase.

### API surface

| Method & Path                          | Purpose                                                                                                                                                                                                                                             |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/images/config`               | Returns `{ providers: [{ id, models, sizes }], defaultProvider, defaultModel, samplesPerModelMax }` based on env. Used by UI to populate dropdowns and hide providers without keys.                                                                 |
| `POST /api/images/references`          | Multipart upload of one or more reference images. Returns `{ id, contentType }[]`.                                                                                                                                                                  |
| `POST /api/images/enhance`             | Body: `{ prompt }`. Returns `{ clarifyingQuestions?: string[], enhancedPrompt?: string }`. Uses OpenAI chat completions.                                                                                                                            |
| `POST /api/images/generate`            | Body: `{ prompt, provider, model?, size?, style?, camera?, aspectRatio?, references?: string[], allModels?: boolean, samplesPerModel?: number }`. Creates N pending `GeneratedImage` rows and kicks off async generation. Returns the pending rows. |
| `GET /api/images?since=<iso>&limit=50` | Returns current user's recent rows newest-first. Used for poll.                                                                                                                                                                                     |
| `GET /api/images/[id]/file`            | Authenticated binary stream of the stored file. 403 cross-user, 404 missing.                                                                                                                                                                        |

### Environment variables

```env
# Providers (existing prototype names, kept for portability)
IMAGE_ROUTER_API_KEY=
IMAGE_ROUTER_BASE_URL=https://api.imagerouter.io
IMAGE_ROUTER_MODELS=openai/gpt-image-1,google/nano-banana-2
OPENAI_API_KEY=

# New for the integrated product
OPENAI_IMAGE_MODELS=gpt-image-1
DEFAULT_PROVIDER=imagerouter
DEFAULT_MODEL=gpt-image-1
UPLOADS_DIR=./uploads
SAMPLES_PER_MODEL_MAX=5
```

Providers whose API key is unset are hidden from the dropdown via `/api/images/config`.

## Deltas from prototype

| Area                                                        | Prototype                                             | Integrated v1                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| Route                                                       | `/` posting to `/generate`                            | `/image-generator` posting to `/api/images/generate`                  |
| Auth                                                        | none                                                  | Better Auth session required                                          |
| Provider files                                              | `src/providers/*.ts`                                  | `src/lib/services/image-providers/*.server.ts`                        |
| Provider hiding                                             | not implemented                                       | hidden when API key unset                                             |
| All Models fan-out                                          | 1 per model                                           | **3 per model** (configurable, default 3)                             |
| Edit                                                        | reference-image only                                  | menu: re-prompt **or** reference-image                                |
| Persistence                                                 | files in `generations/<timestamp>_<model>.png`, no DB | Prisma `GeneratedImage` + `ReferenceImage`, files under `UPLOADS_DIR` |
| Timer                                                       | seconds, one decimal                                  | unchanged (seconds, one decimal)                                      |
| Camera/Aspect/Style values                                  | prototype values                                      | unchanged                                                             |
| Brand kits / headline overlay / logo overlay / custom fonts | implemented                                           | **removed from v1**                                                   |
| Prompt enhancement                                          | implemented                                           | unchanged                                                             |
| Reference image upload                                      | implemented (multipart on generate)                   | refactored to its own endpoint with persisted IDs                     |
| Size nearest-mapping + `sharp` resize                       | implemented                                           | unchanged                                                             |

## Non-goals (v1)

- Brand pipeline (brand kits, logo overlay, headline overlay, custom font upload, `buildPrompt` brand rules) — deferred to a later phase.
- Public galleries, sharing, prompt search.
- Cost / quota tracking, per-user rate limiting.
- Video generation.
- `auto` size support.

## Open questions

- `UPLOADS_DIR` location in production deployment (Docker volume) — document during Polish phase.
- Garbage collection for orphaned reference images that never end up in a `GeneratedImage.referenceIds` — defer; track if disk fills.
