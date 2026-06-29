# Scraper API — UI Integration Guide

The scraper server exposes two HTTP endpoints for triggering on-demand scrapes. Both stream progress logs back to the caller in real time so your UI can show a live console view.

**Base URL:** `${REMOTE_SCRAPER_URL}`

> The url is controlled by the `REMOTE_SCRAPER_URL` environment variable on the server. Confirm the current value with the backend team if it changes.

---

## CORS

The server sets permissive CORS headers by default (`Access-Control-Allow-Origin: *`), so browser requests from any origin will work out of the box during development.

For production, the backend team can restrict it by setting `CORS_ALLOWED_ORIGIN` on the server to your UI's exact origin (e.g. `https://your-app.example.com`). If you start seeing CORS errors after a deployment, ask them to add your origin to that variable.

The server handles `OPTIONS` preflight requests automatically — you do not need to configure anything extra on your end.

---

## Endpoints

### `POST /scrape` — scrape a single URL

Scrapes one restaurant URL and streams the output.

**Request**

```http
POST /scrape
Content-Type: application/json

{
  "url": "https://www.foody.com.cy/delivery/menu/caffe-nero",
  "language": "en"
}
```

| Field      | Type             | Required | Description                                             |
| ---------- | ---------------- | -------- | ------------------------------------------------------- |
| `url`      | string           | Yes      | Full restaurant URL (foody.com.cy, wolt.com, e-food.gr) |
| `language` | `"en"` \| `"el"` | No       | Menu language. Defaults to `"en"`                       |

**Response**

`200 OK` — `Content-Type: text/plain; charset=utf-8` — streamed newline-delimited text.

```
[server] Scraping https://www.foody.com.cy/delivery/menu/caffe-nero (language=en)
INFO  Scraped https://www.foody.com.cy/delivery/menu/caffe-nero via Foody API
[server] Done: provider=foody
  markdown: output\foody\caffe-nero.md
  json: output\foody\caffe-nero.json
  offers=10 categories=16 items=157
```

The last few lines are the summary. Every preceding line is a live scraper log.

---

### `POST /scrape-all` — run the full batch

Scrapes all registered restaurant URLs (merged from the server's config file and the app database). Streams progress for every URL.

**Request**

```http
POST /scrape-all
Content-Type: application/json

{}
```

All fields are optional:

| Field          | Type             | Default        | Description                                                        |
| -------------- | ---------------- | -------------- | ------------------------------------------------------------------ |
| `language`     | `"en"` \| `"el"` | `"en"`         | Language for all scraped menus                                     |
| `workers`      | integer ≥ 1      | `4`            | Concurrent scrape workers                                          |
| `urlsLocation` | string           | server default | Override path to the URLs JSON file on the server — leave this out |

**Response**

`200 OK` — same streaming format. Lines follow this pattern:

```
[urls_to_scrape] ...          ← DB load status (info/warning)
[server] Starting batch for N URLs (file=X, db=Y)
Queued N URLs with 4 workers.
[progress] active=0 completed=0 failed=0 pending=N total=N
[start] 1/N https://...
[job 1/N] https://... -> 5%
INFO  Scraped https://... via Foody API
[done] 1/N foody https://...
  markdown: output\foody\...md
  json: output\foody\...json
[progress] active=0 completed=1 failed=0 pending=N-1 total=N
...
Batch complete.
Succeeded: X
Failed: Y
[server] Final summary: succeeded=X failed=Y total=N
```

`/start` is kept as an alias for backward compatibility.

---

## Consuming the stream

The response body is a `ReadableStream` of newline-delimited UTF-8 text. Use the `fetch` API with a stream reader:

```ts
async function streamScrape(
  endpoint: string,
  body: Record<string, unknown>,
  onLine: (line: string) => void,
): Promise<void> {
  const response = await fetch(`http://200.1.3.249:3506${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.length > 0) onLine(line);
    }
  }

  if (buffer.length > 0) onLine(buffer);
}
```

**Usage — single URL:**

```ts
await streamScrape("/scrape", { url, language: "en" }, (line) => {
  appendToConsolePanel(line);
});
```

**Usage — scrape all:**

```ts
await streamScrape("/scrape-all", {}, (line) => {
  appendToConsolePanel(line);
});
```

---

## Error responses

Non-streaming errors are returned as `application/json`:

```json
{ "error": "..." }
```

| Status | Meaning                                                                      |
| ------ | ---------------------------------------------------------------------------- |
| `400`  | Invalid request body — `url` missing, not a valid URL, or unknown `language` |
| `405`  | Wrong HTTP method                                                            |
| `409`  | A scrape is already running — only one scrape can run at a time              |
| `404`  | Unknown endpoint                                                             |

**Handle the 409** — your UI should disable the trigger buttons while a stream is active and show a clear "already in progress" message if a second request races through:

```ts
if (response.status === 409) {
  showError("A scrape is already running. Please wait for it to finish.");
  return;
}
```

---

## Environment variables needed

You do not need any environment variables in your frontend. The only variable that affects cross-origin access is `CORS_ALLOWED_ORIGIN` on the **server** side.

If the backend team sets `CORS_ALLOWED_ORIGIN` to a specific origin for production, make sure your UI is served from exactly that origin (scheme + hostname + port all match).

---

## Quick test with curl

```bash
# Single URL (stream output live)
curl -N -X POST http://200.1.3.249:3506/scrape \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.foody.com.cy/delivery/menu/caffe-nero","language":"en"}'

# Scrape all
curl -N -X POST http://200.1.3.249:3506/scrape-all \
  -H "Content-Type: application/json" \
  -d '{}'

# Verify CORS preflight
curl -i -X OPTIONS http://200.1.3.249:3506/scrape \
  -H "Origin: https://your-app.example.com" \
  -H "Access-Control-Request-Method: POST"
```
