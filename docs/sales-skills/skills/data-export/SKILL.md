---
name: data-export
description: Instructions for exporting query results as CSV, Excel, or JSON files from the Novasero Sales agent.
version: 1.0.0
tags:
  - export
  - csv
  - excel
  - json
  - download
---

# Data Export

## CSV Export

When a user says "export this", "save as CSV", "download", or similar after results have been shown:

1. Run the actual query (without LIMIT if the user wants all rows, or respect their preference).
2. Call `csvExportTool` with the REAL rows as an array of objects:
   ```
   csvExportTool({ data: rows, filename: 'descriptive-name', _agentName: 'novasero-sales-duck' })
   ```
3. ALWAYS include the `downloadUrl` returned by the tool in your response. Do not omit it.

Example filename conventions:

- `bk_revenue_jan_2026`
- `top_items_kfc_this_month`
- `discount_card_usage_nero`

## Excel Export

When a user asks for an Excel file (.xlsx), spreadsheet, or multi-sheet workbook:

1. Run the query to get the rows.
2. Call `excelTool` with the rows, including sheet name, column headers, and any formatting options.
3. Include the `downloadUrl` from the response.

Use Excel export when:

- The user needs multiple sheets (e.g., one per brand)
- The user needs formatted cells, totals rows, or color-coded data
- The user explicitly asks for .xlsx or "Excel"

## JSON Export

When a user asks for JSON output, structured data, or says "export as JSON":

1. Run the query to get the rows.
2. Call `jsonExportTool` with the rows and a descriptive filename.
3. Include the `downloadUrl` from the response.

Use JSON export when:

- The user is a developer or wants to feed data into another system
- The user explicitly asks for JSON or structured/machine-readable format

## Important Notes

- ALWAYS run the actual data query FIRST, then pass the real rows to the export tool.
- NEVER fabricate or summarize data going into the export — use the exact rows returned by the database.
- Always include the download URL in your final response so the user can retrieve the file.
- Choose the format based on user intent: CSV for simple tabular data, Excel for rich formatting, JSON for programmatic use.
