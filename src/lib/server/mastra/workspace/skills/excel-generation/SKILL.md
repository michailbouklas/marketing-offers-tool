---
name: excel-generation
description: How to use the generateExcel tool and build officecli extraCommands for advanced Excel output — number formats, formulas, totals, conditional styling, freeze panes, autofilter, and charts.
---

# Excel generation (generateExcel tool)

The `generateExcel` tool turns tabular data from the conversation into a
downloadable `.xlsx`. It creates the workbook, the sheets, a **bold header
row**, and all data cells for you — you only pass `filename` and `sheets`
(`{ name, columns, rows }`). The chat UI renders the download button from the
tool result; never invent or repeat the download URL yourself.

## When to use it

- The user asks to save/export/download results as Excel ("save this as
  excel", "give me an xlsx"). If the data isn't in the conversation anymore,
  re-run the query first.
- Do NOT call it when the user just wants to see numbers in chat — answer
  with a markdown table instead.

## Limits

- ≤ 5 sheets, ≤ 50 columns, ≤ 5,000 rows per sheet, ≤ 20,000 cells total.
  If the data is larger, aggregate or narrow it and tell the user.
- Data cells are always literal values — a cell value starting with `=` is
  stored as text, not a formula. Formulas only work via `extraCommands`.

## extraCommands — officecli batch items

`extraCommands` are raw officecli batch items applied AFTER the data is
written, in the same atomic batch. Each item:

```json
{
  "command": "set",
  "path": "/Data/B2:B100",
  "props": { "numberformat": "#,##0.00" }
}
```

- `command`: one of `set`, `add`, `remove`, `move`, `swap`, `merge`.
- `path`: `/SheetName` (sheet), `/SheetName/A1` (cell), or a range
  `/SheetName/B2:C100`. Use the FINAL sheet names you passed in `sheets`.
  Row 1 is the header; data starts at row 2.
- `add` also takes `type` (`sheet`, `row`, `col`, `cell`, `chart`).

### Cell props (`set` on a cell or range)

| Prop                 | Example                                               | Notes                                         |
| -------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `value`              | `"Total"`                                             | Literal value; numeric strings become numbers |
| `formula`            | `"SUM(B2:B100)"`                                      | WITHOUT the leading `=`                       |
| `numberformat`       | `"#,##0.00"`, `"yyyy-mm-dd"`, `"0.0%"`, `"€#,##0.00"` | Excel format string                           |
| `bold` / `italic`    | `"true"`                                              | Font style                                    |
| `font.color`         | `"FF0000"`                                            | Hex, no `#`                                   |
| `fill`               | `"FFF2CC"`                                            | Background color, hex                         |
| `font.name` / `size` | `"Calibri"` / `"12pt"`                                |                                               |

### Common recipes

Total row with a SUM under 100 data rows in column B (data sheet "Data"):

```json
[
  {
    "command": "set",
    "path": "/Data/A102",
    "props": { "value": "Total", "bold": "true" }
  },
  {
    "command": "set",
    "path": "/Data/B102",
    "props": {
      "formula": "SUM(B2:B101)",
      "bold": "true",
      "numberformat": "€#,##0.00"
    }
  }
]
```

Currency formatting for a whole column range:

```json
{
  "command": "set",
  "path": "/Data/C2:C101",
  "props": { "numberformat": "€#,##0.00" }
}
```

Freeze the header row and add an autofilter (sheet-level `set`):

```json
{
  "command": "set",
  "path": "/Data",
  "props": { "freeze": "A2", "autoFilter": "A1:D101" }
}
```

Sort a range by its first column (header row excluded from the range):

```json
{ "command": "set", "path": "/Data/A2:D101", "props": { "sort": "A asc" } }
```

Column width (`set` on a column RANGE — a bare column letter like `/Data/A`
fails with "Element not found"; always use the `A:A` range form, even for a
single column):

```json
{ "command": "set", "path": "/Data/A:A", "props": { "width": "20" } }
```

```json
{ "command": "set", "path": "/Data/B:E", "props": { "width": "14" } }
```

Chart anchored on the sheet (`x,y,w,h` in cells):

```json
{
  "command": "add",
  "path": "/Data",
  "type": "chart",
  "props": { "anchor": "6,1,8,15", "type": "bar", "source": "A1:B10" }
}
```

Merge cells:

```json
{ "command": "merge", "path": "/Data/A1:C1" }
```

## Failure handling

The tool returns `{ ok: false, error }` when a batch item is invalid — read
the error, fix the offending item, and retry once. If it keeps failing, drop
`extraCommands` and deliver the plain data export rather than nothing.
