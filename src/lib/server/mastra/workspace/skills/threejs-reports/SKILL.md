---
name: threejs-reports
description: How to use the generateThreeJsReport tool — choosing bar3d/line3d/pie3d/scatter3d, shaping labels/series/points, limits, and when to ask a clarifying question instead of guessing.
---

# 3D chart reports (generateThreeJsReport tool)

The `generateThreeJsReport` tool turns data from the conversation into a
standalone interactive 3D chart page (three.js — orbit, zoom, hover tooltips,
plus a collapsible data table). The page works offline once downloaded. The
chat UI renders the open/download card from the tool result; never invent or
repeat the URLs yourself.

## When to use it

- The user asks for a graph, chart, plot, or visualization ("create a graph
  with this data", "visualize this by brand"). If the data isn't in the
  conversation anymore, re-run the query first.
- Do NOT call it when the user just wants to see numbers — answer with a
  markdown table instead. A 3D report earns its place for comparisons,
  trends, shares, and 3-dimensional relations, not for two or three values.

## Choosing a chart type

| chartType   | Use for                                                                                   | Needs                                                |
| ----------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `bar3d`     | comparing categories, optionally across several series (e.g. revenue per brand per month) | `labels` + `series`                                  |
| `line3d`    | trends over ordered categories (dates, weeks)                                             | `labels` + `series`                                  |
| `pie3d`     | share of a whole at one point in time                                                     | `labels` + exactly ONE series of **positive** values |
| `scatter3d` | three numeric dimensions per row (e.g. price vs discount vs orders)                       | `points` only                                        |

- `pie3d` with more than one series is rejected — use `bar3d` to compare
  series. More than 8 slices is rejected — group the tail into "Other" first.
- `scatter3d` ignores `labels`/`series`; each point is `{x, y, z, label?}` and
  the axis names go in `options.xLabel/yLabel/zLabel`.

## Ask, don't guess

If any of these is missing or ambiguous, ask ONE concise question before
calling the tool, listing the options you see in the data:

- which chart type fits what the user wants to see,
- which column is the category (labels) and which column(s) are the values,
- for scatter3d, which three numeric columns map to x/y/z.

The tool also returns `ok: false` with an instruction when the input shape is
wrong — fix the input or relay the question to the user; do not retry blindly.

## Limits

- ≤ 100 labels, ≤ 8 series, ≤ 2,000 values total, ≤ 500 scatter points.
  If the data is larger, aggregate first (group by week instead of day, top-N
  categories + "Other") and tell the user what you did.
- Every series must have exactly one value per label, in the same order.

## Worked examples

bar3d — revenue by brand across two months:

```json
{
  "filename": "revenue-by-brand-jun-jul-2026.html",
  "title": "Revenue by brand",
  "subtitle": "June vs July 2026, Wolt only",
  "chartType": "bar3d",
  "labels": ["Brand A", "Brand B", "Brand C"],
  "series": [
    { "name": "June", "values": [12100.5, 9800, 7400.25] },
    { "name": "July", "values": [13050, 10120.4, 8010] }
  ],
  "options": { "valueLabel": "EUR" }
}
```

line3d — weekly orders per aggregator:

```json
{
  "filename": "weekly-orders-q2-2026.html",
  "title": "Weekly orders",
  "chartType": "line3d",
  "labels": ["W14", "W15", "W16", "W17"],
  "series": [
    { "name": "Wolt", "values": [420, 465, 440, 510] },
    { "name": "Bolt", "values": [310, 330, 355, 340] }
  ],
  "options": { "valueLabel": "orders" }
}
```

pie3d — share of revenue by aggregator (one series, positive values):

```json
{
  "filename": "revenue-share-july-2026.html",
  "title": "Revenue share by aggregator",
  "chartType": "pie3d",
  "labels": ["Wolt", "Bolt", "Foody"],
  "series": [{ "name": "Revenue", "values": [58200, 31400, 12800] }],
  "options": { "valueLabel": "EUR" }
}
```

scatter3d — offer price vs discount vs orders:

```json
{
  "filename": "offer-price-discount-orders.html",
  "title": "Offers: price vs discount vs orders",
  "chartType": "scatter3d",
  "points": [
    { "x": 12.9, "y": 20, "z": 145, "label": "2-for-1 Burger" },
    { "x": 8.5, "y": 35, "z": 210, "label": "Pizza Tuesday" }
  ],
  "options": {
    "xLabel": "price EUR",
    "yLabel": "discount %",
    "zLabel": "orders"
  }
}
```

## After the tool succeeds

Briefly confirm the report is ready and what it shows. The chat UI renders
the card (click opens a new tab) and the download button — do not repeat the
links, and never rewrite `openUrl`/`downloadUrl`.
