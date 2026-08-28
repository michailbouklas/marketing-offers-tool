# Project description

This is a tool to register and edit offers that the marketing team wants to push to the aggregators, like Wolt and Bolt. They add the new offer to the tool and then we can do look ups against the aggregator invoices to get the offer performance and share it with the marketing team.

Before every new task, use the SymDex MCP server to reindex the project so the symbol index is fresh:

```json
{ "tool": "index_folder", "path": ".", "name": "aggregator-offers-tool" }
```

### When to use SymDex

| Goal                              | Tool                                                 |
| --------------------------------- | ---------------------------------------------------- |
| Find a function or class by name  | `search_symbols`                                     |
| Read a specific function's source | `get_symbol` with byte offsets from `search_symbols` |
| Find code by what it does         | `semantic_search`                                    |
| List all symbols in a file        | `get_file_outline`                                   |
| Understand project structure      | `get_repo_outline`                                   |
| Find all callers of a function    | `get_callers`                                        |
| Find what a function calls        | `get_callees`                                        |
| Check index is fresh              | `get_index_status`                                   |

### Rules for agents

1. Never read a full file to find a function — call `search_symbols` or `semantic_search` first.
2. Use byte offsets returned by symbol search to read only the target symbol via `get_symbol`.
3. Re-index after modifying source files using `index_folder` or `invalidate_cache`.

## DB Struc

- aggregator_offers: This table contains the offers that the marketing team wants to push to the aggregators. It has the following columns:
  - id: The unique identifier of the offer.
  - name: The name of the offer.
  - description: The description of the offer.
  - aggregator: The aggregator that the offer is pushed to, e.g. Wolt, Bolt etc.
  - active: A boolean value that indicates whether the offer is active or not.
  - start_date: The date when the offer starts.
  - end_date: The date when the offer ends.
  - created_at: The date when the offer is created.
  - updated_at: The date when the offer is updated.
- api_WOLT_header: This table contains the Wolt invoice headers that we get from the Wolt API. It has the following columns:
  - id: The unique identifier of the invoice header.
  - invoice_id: The unique identifier of the invoice.
  - order_id: The unique identifier of the order.
  - offer_id: The unique identifier of the offer that is associated with the invoice. This is a foreign key to the aggregator_offers table.
  - created_at: The date when the invoice header is created.
  - updated_at: The date when the invoice header is updated.
- api_WOLT_line: This table contains the Wolt invoice lines that relate to a Wolt invoice header. It has the following columns:
  - id: The unique identifier of the invoice line.
  - invoice_header_id: The unique identifier of the invoice header that the invoice line relates to. This is a foreign key to the api_WOLT_header table.
  - product_name: The name of the product that is associated with the invoice line.
  - quantity: The quantity of the product that is associated with the invoice line.
  - price: The price of the product that is associated with the invoice line.
  - created_at: The date when the invoice line is created.
  - updated_at: The date when the invoice line is updated.

# IMPORTANT INSTRUCTIONS

- Always follow the instructions in this file when generating code.
- Do not make up any information. If you are unsure, ask for clarification.
- If you are unsure how to proceed, ask for clarification.
- Use context7 mcp server to get documentation on tailwindcss 4 zod, svelte-superforms and shadcn-svelte.
- ONLY use svelte 5 syntax. DO NOT use svelte 4 syntax.
- ONLY use tailwindcss 4 syntax. DO NOT use tailwindcss 3 syntax.
- Check context7 mcp server against shadcn-svelte when you want to use a design related component, like buttons, modals etc. Do not write your own components if there's an existing one.
- ALWAYS use tailwindcss for styling. Do not use any other styling method.
- ALWAYS use sveltekit for routing and server side code. Do not use any other method.
- Do not hardcode any values. Always use environment variables or props to pass values.
- ALWAYS use environment variables for any URLs, keys, or other configuration values. Do not hardcode them.
- When creating HTTP services to call backend APIs, ALWAYS consulte with the `/docs/openapi.json` file in the backend project to get the correct endpoint, request and response format.
- USE svelte 5 syntax for reactive statements. DO NOT use svelte 4 syntax.
- USE svelte 5 runes for reactive variable declarations, for example $state and $derived. DO NOT use svelte 4 syntax.
- USE svelte 5 props when using functions as component events. DO NOT use the dispatch pattern.
- USE tailwindcss 4 syntax for styling. DO NOT use tailwindcss 3 syntax. There's no tailwind.config.js anymore
- When creating user interfaces ALWAYS consider the user experience. Make sure the interface is easy to use and understand.
- If you're adding a new environment variable, ALWAYS update the .env.example file.
- ALWAYS use zod for validation. Do not use any other validation library.
- ALWAYS use svelte-superforms for forms. Do not use any other form library.
- ALWAYS use shadcn-svelte for design related components. Do not write your own components if there's an existing one.
- ALWAYS separate logic into smaller components. Do not write large monolithic components.
- ALWAYS separate UI and logic. Do not mix them together. Any UI related code should be in the component. Any logic related code should be in a separate service file.
- Call the `svelte-autofixer` tool after every change you make to the code. Do not skip this step.
- Call remote apis from within dedicated service files. Do not call remote apis directly from the components.
- IF shadcn is mentioned, assume shadcn-svelte is meant.

# Prisma

- NEVER execute a prisma command if prisma warns you of reseting the database. Always check with the team before executing such commands.
- ALWAYS use prisma migrate for database migrations. Do not use prisma db push or any other method
- NEVER execute a prisma migrate command without checking the generated SQL first. Always check with the team before executing such commands.
- NEVER execute a prisma migrate command if it contains destructive changes. Always check with the team before executing such commands.

# shadcn-svelte

> shadcn-svelte is a collection of beautifully-designed, accessible components for Svelte and SvelteKit. It is built with TypeScript, Tailwind CSS, and Bits UI primitives. Open Source. Open Code. AI-Ready. It also comes with a command-line tool to install and manage components and a registry system to publish and distribute code.

## Overview

- [About](https://shadcn-svelte.com/docs/about.md): Powered by amazing open source projects.
- [Changelog](https://shadcn-svelte.com/docs/changelog.md): Latest updates and announcements.
- [shadcn-svelte](https://shadcn-svelte.com/docs/cli.md): Use the shadcn-svelte CLI to add components to your project.
- [components.json](https://shadcn-svelte.com/docs/components-json.md): Configuration for your project.
- [JavaScript](https://shadcn-svelte.com/docs/javascript.md): How to use shadcn-svelte with JavaScript.
- [Legacy Docs](https://shadcn-svelte.com/docs/legacy.md): View the legacy docs for shadcn-svelte and Tailwind v3.
- [Theming](https://shadcn-svelte.com/docs/theming.md): Use CSS Variables to customize the look and feel of your application.

## Installation

- [Astro](https://shadcn-svelte.com/docs/installation/astro.md): How to setup shadcn-svelte in an Astro project.
- [Manual Installation](https://shadcn-svelte.com/docs/installation/manual.md): How to setup shadcn-svelte manually.
- [SvelteKit](https://shadcn-svelte.com/docs/installation/sveltekit.md): How to setup shadcn-svelte in a SvelteKit project.
- [Vite](https://shadcn-svelte.com/docs/installation/vite.md): How to setup shadcn-svelte in a Vite project.

## Components

### Form & Input

- [Button](https://shadcn-svelte.com/docs/components/button.md): Displays a button or a component that looks like a button.
- [Button Group](https://shadcn-svelte.com/docs/components/button-group.md): A container that groups related buttons together with consistent styling.
- [Calendar](https://shadcn-svelte.com/docs/components/calendar.md): A calendar component that allows users to select dates.
- [Checkbox](https://shadcn-svelte.com/docs/components/checkbox.md): A control that allows the user to toggle between checked and not checked.
- [Combobox](https://shadcn-svelte.com/docs/components/combobox.md): Autocomplete input and command palette with a list of suggestions.
- [Date Picker](https://shadcn-svelte.com/docs/components/date-picker.md): A date picker component with range and presets.
- [Field](https://shadcn-svelte.com/docs/components/field.md): Combine labels, controls, and help text to compose accessible form fields and grouped inputs.
- [Formsnap](https://shadcn-svelte.com/docs/components/form.md): Building forms with Formsnap, Superforms, & Zod.
- [Input](https://shadcn-svelte.com/docs/components/input.md): Displays a form input field or a component that looks like an input field.
- [Input Group](https://shadcn-svelte.com/docs/components/input-group.md): Display additional information or actions to an input or textarea.
- [Input OTP](https://shadcn-svelte.com/docs/components/input-otp.md): Accessible one-time password component with copy paste functionality.
- [Label](https://shadcn-svelte.com/docs/components/label.md): Renders an accessible label associated with controls.
- [Native Select](https://shadcn-svelte.com/docs/components/native-select.md): A styled native HTML select element with consistent design system integration.
- [Radio Group](https://shadcn-svelte.com/docs/components/radio-group.md): A set of checkable buttonsâ€”known as radio buttonsâ€”where no more than one of the buttons can be checked at a time.
- [Select](https://shadcn-svelte.com/docs/components/select.md): Displays a list of options for the user to pick fromâ€”triggered by a button.
- [Slider](https://shadcn-svelte.com/docs/components/slider.md): An input where the user selects a value from within a given range.
- [Switch](https://shadcn-svelte.com/docs/components/switch.md): A control that allows the user to toggle between checked and not checked.
- [Textarea](https://shadcn-svelte.com/docs/components/textarea.md): Displays a form textarea or a component that looks like a textarea.

### Layout & Navigation

- [Accordion](https://shadcn-svelte.com/docs/components/accordion.md): A vertically stacked set of interactive headings that each reveal a section of content.
- [Breadcrumb](https://shadcn-svelte.com/docs/components/breadcrumb.md): Displays the path to the current resource using a hierarchy of links.
- [Navigation Menu](https://shadcn-svelte.com/docs/components/navigation-menu.md): A collection of links for navigating websites.
- [Resizable](https://shadcn-svelte.com/docs/components/resizable.md): Accessible resizable panel groups and layouts with keyboard support.
- [Scroll Area](https://shadcn-svelte.com/docs/components/scroll-area.md): Augments native scroll functionality for custom, cross-browser styling.
- [Separator](https://shadcn-svelte.com/docs/components/separator.md): Visually or semantically separates content.
- [Sidebar](https://shadcn-svelte.com/docs/components/sidebar.md): A composable, themeable and customizable sidebar component.
- [Tabs](https://shadcn-svelte.com/docs/components/tabs.md): A set of layered sections of contentâ€”known as tab panelsâ€”that are displayed one at a time.

### Overlays & Dialogs

- [Alert Dialog](https://shadcn-svelte.com/docs/components/alert-dialog.md): A modal dialog that interrupts the user with important content and expects a response.
- [Command](https://shadcn-svelte.com/docs/components/command.md): Fast, composable, unstyled command menu for Svelte.
- [Context Menu](https://shadcn-svelte.com/docs/components/context-menu.md): Displays a menu to the user â€” such as a set of actions or functions â€” triggered by right click.
- [Dialog](https://shadcn-svelte.com/docs/components/dialog.md): A window overlaid on either the primary window or another dialog window, rendering the content underneath inert.
- [Drawer](https://shadcn-svelte.com/docs/components/drawer.md): A drawer component for Svelte.
- [Dropdown Menu](https://shadcn-svelte.com/docs/components/dropdown-menu.md): Displays a menu to the user â€” such as a set of actions or functions â€” triggered by a button.
- [Hover Card](https://shadcn-svelte.com/docs/components/hover-card.md): For sighted users to preview content available behind a link.
- [Menubar](https://shadcn-svelte.com/docs/components/menubar.md): A visually persistent menu common in desktop applications that provides quick access to a consistent set of commands.
- [Popover](https://shadcn-svelte.com/docs/components/popover.md): Displays rich content in a portal, triggered by a button.
- [Sheet](https://shadcn-svelte.com/docs/components/sheet.md): Extends the Dialog component to display content that complements the main content of the screen.
- [Tooltip](https://shadcn-svelte.com/docs/components/tooltip.md): A popup that displays information related to an element when the element receives keyboard focus or the mouse hovers over it.

### Feedback & Status

- [Alert](https://shadcn-svelte.com/docs/components/alert.md): Displays a callout for user attention.
- [Badge](https://shadcn-svelte.com/docs/components/badge.md): Displays a badge or a component that looks like a badge.
- [Empty](https://shadcn-svelte.com/docs/components/empty.md): Use the Empty component to display a empty state.
- [Progress](https://shadcn-svelte.com/docs/components/progress.md): Displays an indicator showing the completion progress of a task, typically displayed as a progress bar.
- [Skeleton](https://shadcn-svelte.com/docs/components/skeleton.md): Use to show a placeholder while content is loading.
- [Sonner](https://shadcn-svelte.com/docs/components/sonner.md): An opinionated toast component for Svelte.
- [Spinner](https://shadcn-svelte.com/docs/components/spinner.md): An indicator that can be used to show a loading state.

### Display & Media

- [Aspect Ratio](https://shadcn-svelte.com/docs/components/aspect-ratio.md): Displays content within a desired ratio.
- [Avatar](https://shadcn-svelte.com/docs/components/avatar.md): An image element with a fallback for representing the user.
- [Card](https://shadcn-svelte.com/docs/components/card.md): Displays a card with header, content, and footer.
- [Carousel](https://shadcn-svelte.com/docs/components/carousel.md): A carousel with motion and swipe built using Embla.
- [Chart](https://shadcn-svelte.com/docs/components/chart.md): Beautiful charts. Built using LayerChart. Copy and paste into your apps.
- [Data Table](https://shadcn-svelte.com/docs/components/data-table.md): Powerful table and datagrids built using TanStack Table.
- [Item](https://shadcn-svelte.com/docs/components/item.md): A versatile component that you can use to display any content.
- [Kbd](https://shadcn-svelte.com/docs/components/kbd.md): Used to display textual user input from keyboard.
- [Table](https://shadcn-svelte.com/docs/components/table.md): A responsive table component.
- [Typography](https://shadcn-svelte.com/docs/components/typography.md): Styles for headings, paragraphs, lists...etc

### Misc

- [Collapsible](https://shadcn-svelte.com/docs/components/collapsible.md): An interactive component which expands/collapses a panel.
- [Pagination](https://shadcn-svelte.com/docs/components/pagination.md): Pagination with page navigation, next and previous links.
- [Range Calendar](https://shadcn-svelte.com/docs/components/range-calendar.md): A calendar component that allows users to select a range of dates.
- [Toggle](https://shadcn-svelte.com/docs/components/toggle.md): A two-state button that can be either on or off.
- [Toggle Group](https://shadcn-svelte.com/docs/components/toggle-group.md): A set of two-state buttons that can be toggled on or off.

## Dark Mode

- [Svelte](https://shadcn-svelte.com/docs/dark-mode/svelte.md): Adding dark mode to your Svelte site.

# Extending knowledge

- If after a task is complete you feel like some knowledge can be useful for the future, add it to this file. Do not forget to add a reference to the source of the knowledge if applicable.
- Any business related knowledge should be added to the Notion knowledge base, not here. Do add a reference to the target knowledge file though. This file is only for technical knowledge related to the codebase and technologies used in the project.
- Whenever you create a new service file, add a reference to it in this file with a brief description of what the service does. This will help the future self to quickly find the relevant service file when needed.

## Service references

- `src/lib/services/offers-filter-form.ts`: Defines the Zod + superforms filter schema for the `/aggregator-offers` page and maps URL/search-form values into `aggregator-offers` service filters.
- `src/lib/services/brands.ts`: Shared brand types for browser-safe imports, including lightweight brand option data for selects and related offer views.
- `src/lib/services/brands.server.ts`: Server-only Prisma queries for brand records, currently used to populate offer forms and filters.
- `src/lib/services/aggregator-offers.ts`: Shared types, enums (`Aggregator`), and type aliases (`AggregatorOffer`, `AggregatorOffersFilters`, `CreateAggregatorOfferInput`, `UpdateAggregatorOfferInput`). Safe for browser imports — contains no server code.
- `src/lib/services/aggregator-offers.server.ts`: Server-only Prisma queries for aggregator offers (CRUD). Must only be imported from `.server.ts` files or server hooks.
- `src/lib/auth/roles.ts`: Central role definitions for Better Auth. Declares supported user roles and the shared `role` field config used by server and client auth setup.
- `src/lib/server/auth.ts`: Better Auth server instance. Configured with Prisma adapter (PostgreSQL), email/password auth, sign-up disabled, and the Better Auth `admin` plugin for role-aware sessions and admin APIs.
- `src/lib/server/clickhouse.ts`: Server-only ClickHouse client singleton and ping helper for new analytics/data-quality features that read or write ClickHouse.
- `src/lib/server/merchant-scrapes-prisma.ts`: Server-only Prisma client singleton for the isolated merchant scrapes database configured by `MERCHANT_SCRAPES_DATABASE_URL` and generated from `prisma/merchant-scrapes/schema.prisma`.
- `src/lib/auth-client.ts`: Better Auth browser client. Exports `authClient`, `signIn`, `signOut`, `useSession`, and wires the Better Auth `adminClient` plugin.
- `src/hooks.server.ts`: SvelteKit server hook. Resolves the session on every request via `auth.api.getSession` and sets `event.locals.session` / `event.locals.user`. Redirects unauthenticated users to `/login`.
- `src/lib/server/auth-guards.ts`: Shared auth guard helpers for authenticated/admin-only route checks and route classification.
- `src/lib/services/offers-data-quality.ts`: Shared types and Zod schemas for the discount data-quality APIs, including lookup option types, gap load response types, and route/query param validation.
- `src/lib/services/offers-data-quality-postgres.server.ts`: Server-only PostgreSQL services for channels/categories/subcategories lookups, gap record reads, staging writes, and workflow status updates.
- `src/lib/services/offers-data-quality-clickhouse.server.ts`: Server-only ClickHouse read helpers for `transaction_details` item context and `dim_offers` current pricing values, including lookback-window enforcement.
- `src/lib/services/dim-offers-audit.server.ts`: Server-only PostgreSQL audit logger for approved `dim_offers` writes, storing before/after snapshots, changed fields, actor, and workflow references.
- `src/lib/services/offers-data-quality.server.ts`: Orchestrates mixed PostgreSQL + ClickHouse reads for the data-quality form load endpoint.
- `src/lib/services/offers-data-quality-list.ts`: Browser-safe client for refreshing the gap queue via the `/api/gaps` endpoint without route URL updates.
- `src/lib/services/admin-pending-submissions.ts`: Browser-safe admin submission review client that calls the pending-submission approval APIs for single and bulk decisions.
- `src/lib/services/admin-dim-offers.ts`: Browser-safe admin `dim_offers` row and pagination types shared by the admin table UI.
- `src/lib/services/admin-dim-offers.server.ts`: Server-only ClickHouse queries for paginated admin `dim_offers` browsing, including optional brand filtering via transaction brand aliases.
- `src/routes/admin/dim-offers/[itemCode]/+page.server.ts`: Server load for the admin-only `dim_offers` audit history view, combining the current ClickHouse row with PostgreSQL audit entries for one item.
- `src/routes/offers-data-quality/+page.server.ts`: Server load for the gaps queue page, now also resolves the authenticated user's allowed brand list from `brand` / `user_brand` and applies alias-based queue filters from URL params.
- `src/routes/offers-data-quality/+page.server.ts`: Server load for the gaps queue page, listing open and submitted pricing gaps.
- `src/routes/offers-data-quality/[id]/+page.server.ts`: Server load for the pricing form route, including gap details, lookups, and pre-populated form state.
- `src/routes/admin/pending-submissions/+page.server.ts`: Server load for the admin-only pending submissions queue, including staged values plus current `dim_offers` comparison data for dialog review.
- `src/routes/admin/dim-offers/+page.server.ts`: Server load for the admin-only `dim_offers` browser, including active brand filter options and paginated ClickHouse rows.
- `src/lib/services/home-offer-widgets.ts`: Builds the home page dashboard widget data for active offers, offers expiring exactly two days out, and recently expired offers using Prisma queries and compact previews.
- `src/lib/services/user-editor-form.ts`: Defines the Zod + superforms schemas and default value mappers for the admin users create/edit dialogs.
- `src/lib/services/transport-security.ts`: Browser-safe helper for detecting insecure HTTP contexts and blocking password submissions unless the app is running on HTTPS or loopback localhost.
- `src/lib/services/users.ts`: Shared admin users types for browser-safe imports, including the admin users table row shape.
- `src/lib/services/users.server.ts`: Server-only user management helpers for listing users and delegating create/update/password changes to Better Auth admin APIs.
- `src/lib/services/image-generator/composer-library.ts`: Browser-safe Zod schemas and DTO types for saved image-generator presets/templates and their reusable composer settings.
- `src/lib/services/image-generator/composer-library.server.ts`: Server-only CRUD services for image-generator presets/templates, including owner checks and template brand assignment validation.
- `src/lib/services/competition/scrape-sessions.ts`: Browser-safe scrape session row and pagination types for the super-user Competition active-offers audit view.
- `src/lib/services/competition/scrape-sessions.server.ts`: Server-only ClickHouse queries for paginated scraper session audit data from `scrape_session`, ordered by newest scrape.
- `src/lib/services/competition/active-offers-by-day.ts`: Browser-safe client for asynchronously loading the Competition dashboard active-offers-by-day-by-aggregator chart from its API endpoint.
- `src/lib/services/competition/active-offers-timeseries.server.ts`: Server-only ClickHouse query service for the Competition dashboard 45-day active-offers-by-aggregator time series.
- `src/lib/services/forecasts/forecast-types.ts`: Browser-safe Zod contract for the Sales Forecasts feature (camelCase mirror of the Python engine's `ForecastResult`/`ModelInfo`, run/history request schemas, error envelope), plus URL filter helpers (`parseForecastFilters`, `buildForecastHref`) and per-model stroke identity.
- `src/lib/services/forecasts/forecast-scope.server.ts`: Server-only permission gate + fail-closed brand scope for `/forecasts` (`resolveForecastBrand`, `loadForecastPageContext`); brands derive from the session user via `listScopedBrands`, never from the request.
- `src/lib/services/forecasts/forecast-series.server.ts`: Server-only ClickHouse queries for a brand's daily net revenue/order series from `transactions` (latest sales date, history window, sparse daily series, history summary).
- `src/lib/services/forecasts/forecast-engine.server.ts`: Server-only client for the Python forecast sidecar (`FORECAST_SERVICE_URL`) behind a swappable transport seam; model-catalog TTL cache and typed `ForecastError` mapping.
- `src/lib/services/forecasts/forecast-run.server.ts`: Orchestrates one forecast run (catalog lookup → ClickHouse series → engine call) with a result cache keyed by brand/model/horizon/latest sales date, in-flight dedupe, and error→HTTP status mapping.
- `src/lib/services/forecasts/forecast-client.ts`: Browser-safe fetch wrappers for `/api/forecasts/*` that Zod-validate success and error envelopes and throw typed `ForecastClientError`s.
- `src/lib/services/forecasts/forecast-runs.svelte.ts`: Browser-side rune controller that fans out one request per selected model, with per-model abort/retry state and a small result cache shared by the forecasts pages.
- `src/lib/services/forecasts/forecast-narrative.ts`: Pure plain-language templating for forecast results (headline, confidence, trend, weekday notes, compact money formatting, model agreement).
- `src/lib/services/forecasts/forecast-chart-data.ts`: Pure chart-row builders for the forecast charts (history + forecast merge, seam row, y-domain, axis tick subsampling, compare overlays).
- `src/routes/api/forecasts/models/+server.ts`: Authenticated JSON endpoint returning the forecast model catalog from the engine.
- `src/routes/api/forecasts/history/+server.ts`: Authenticated, brand-scoped JSON endpoint returning a brand's recent daily sales history and total usable history days.
- `src/routes/api/forecasts/run/+server.ts`: Authenticated, brand-scoped JSON endpoint that runs exactly one forecast model for one brand (optionally one of its locations) and horizon (per-model isolation).
- `src/routes/forecasts/+layout.server.ts`: Section load for `/forecasts` — permission check, scoped brands, model catalog, and engine availability shared by the overview, compare, and per-model pages.
- `src/routes/forecasts/page-data.server.ts`: Route-local server helper shared by the forecasts pages — loads the selected brand's locations (for the location combobox), validates the `location` URL filter against them, and resolves the days of usable sales history for the controls bar (`0` = no sales data, `null` = unknown/no brand).
- `src/routes/api/forecasts/locations/+server.ts`: Authenticated, brand-scoped JSON endpoint listing a brand's `tran_location`/`location_name` pairs with recent sales, used to populate the location filter.
- `src/lib/server/mastra/agents/forecasts-agent.ts`: Mastra "Forecast Assistant" agent embedded on `/forecasts` (brand-scoped, `forecasts: ["view"]`). Reads/compares forecasts through the forecast tools, explains models/metrics/warnings from the `forecast-models` skill, and can query recorded sales with `querySalesSql`; dynamic instructions add the brand scope and the page's current filters (`FORECAST_PAGE_CONTEXT_RUNTIME_KEY`).
- `src/lib/server/mastra/agents/brand-scope-section.ts`: Shared brand-scope instruction section (`resolveScopedBrands`, `buildBrandScopeSection`) for the brand-scoped sales and forecasts agents.
- `src/lib/server/mastra/tools/forecast-tools.ts`: Mastra tools `listForecastModels`, `getSalesHistoryCoverage`, `getForecastSummary`, `compareForecastModels`. Each authorises the brand against the RequestContext scope (fails closed), reaches the forecast services via the injected gateway, caps comparisons at 4 models / 2 in flight, and returns compact `{ ok, … }` results (never throws).
- `src/lib/server/mastra/tools/forecast-compact.ts`: Pure compaction of a `ForecastResult` for the chat model — history dropped, daily points for ≤ 14-day horizons or weekly buckets otherwise, rounded figures, warnings and sentences pre-worded with `forecast-narrative.ts`; plus the compare-table/recommendation output.
- `src/lib/server/mastra/tools/forecast-gateway.ts`: `ForecastGateway` interface + `globalThis` registry — the seam that lets the mastra directory use the forecast services without importing `$env`-dependent modules (keeps `mastra dev` bundlable).
- `src/lib/server/forecast-gateway.server.ts`: SvelteKit-side `ForecastGateway` implementation over `listForecastModels`, `listBrandLocations`, `getSalesHistorySummary`, `getLocationHistoryCoverage` and `getForecastForBrand`; flattens `ForecastError` into plain outcomes. `installForecastGateway()` runs from `src/hooks.server.ts`.
- `src/lib/server/chat-page-context.ts`: Normalises the chat widget's optional `context` (page filters) into a `ForecastPageContext`, dropping brands outside the caller's scope and invalid values.
- `src/lib/server/mastra/workspace/skills/forecast-models/SKILL.md`: Plain-language knowledge skill for the Forecast Assistant — models, accuracy metrics and grades, warning/error codes, limitations, "which number to plan with".
- `src/lib/services/aggregator-invoices/invoice-details.ts`: Browser-safe API client for loading individual invoice details and period-filtered per-store invoice metrics.
- `src/lib/server/mastra/chat-registry.ts`: Server-side allowlist of chat agents the `/api/ai/chat` endpoint may route to. Each entry is a `ChatAgentConfig` with an optional `permissions` (omit to allow any authenticated user), optional `brandScoped` flag and optional `pageContext` flag (accept the widget's validated page filters); also exports `BRAND_SCOPE_RUNTIME_KEY` / `BRAND_SCOPE_NAMES_RUNTIME_KEY` (the caller's brand aliases/names) and `FORECAST_PAGE_CONTEXT_RUNTIME_KEY`.
- `src/lib/server/mastra/agents/offers-data-quality-agent.ts`: Mastra "Data Quality Assistant" agent for `/offers-data-quality`. Available to any authenticated user and brand-scoped via dynamic instructions that read the caller's brand aliases from the RequestContext. Uses the two data-quality SQL tools plus the shared Excel tool.
- `src/lib/server/mastra/tools/query-data-quality-sql.ts`: Mastra tool running read-only PostgreSQL SELECTs against the data-quality workflow tables (`dq_missing_offers_pricing`, `dim_offers_staging`, `dim_offers_audit`, and the channel/category/subcategory lookups). Own pg pool, read-only transaction, 200-row cap.
- `src/lib/server/mastra/tools/query-dim-offers-sql.ts`: Mastra tool running read-only ClickHouse SELECTs against the current offer pricing (`dim_offers`) plus `transaction_details` and `apidata_replica.dim_items`. Uses the default ClickHouse database, `readonly=2`, and a 200-row cap.
- `src/lib/server/mastra/workspace/skills/data-quality-sql/SKILL.md` and `.../dim-offers-sql/SKILL.md`: Schema references and proven query patterns for the two data-quality SQL tools (PostgreSQL workflow tables and ClickHouse pricing tables respectively).

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **marketing-offers-tool** (5386 symbols, 9672 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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

| Resource                                               | Use for                                  |
| ------------------------------------------------------ | ---------------------------------------- |
| `gitnexus://repo/marketing-offers-tool/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/marketing-offers-tool/clusters`       | All functional areas                     |
| `gitnexus://repo/marketing-offers-tool/processes`      | All execution flows                      |
| `gitnexus://repo/marketing-offers-tool/process/{name}` | Step-by-step execution trace             |

## CLI

| Task                                              | Read this skill file                                        |
| ------------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?"      | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"       | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"                  | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor               | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference                | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands           | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |
| Work in the Services area (218 symbols)           | `.claude/skills/generated/services/SKILL.md`                |
| Work in the Server area (143 symbols)             | `.claude/skills/generated/server/SKILL.md`                  |
| Work in the Aggregator-kpis area (126 symbols)    | `.claude/skills/generated/aggregator-kpis/SKILL.md`         |
| Work in the Image-generator area (78 symbols)     | `.claude/skills/generated/image-generator/SKILL.md`         |
| Work in the Image-providers area (53 symbols)     | `.claude/skills/generated/image-providers/SKILL.md`         |
| Work in the Competition area (52 symbols)         | `.claude/skills/generated/competition/SKILL.md`             |
| Work in the Google-reviews area (36 symbols)      | `.claude/skills/generated/google-reviews/SKILL.md`          |
| Work in the Aggregator-invoices area (33 symbols) | `.claude/skills/generated/aggregator-invoices/SKILL.md`     |
| Work in the Notifications area (32 symbols)       | `.claude/skills/generated/notifications/SKILL.md`           |
| Work in the Inspiration area (19 symbols)         | `.claude/skills/generated/inspiration/SKILL.md`             |
| Work in the Copywriter area (17 symbols)          | `.claude/skills/generated/copywriter/SKILL.md`              |
| Work in the Scripts area (13 symbols)             | `.claude/skills/generated/scripts/SKILL.md`                 |
| Work in the Brand-context area (11 symbols)       | `.claude/skills/generated/brand-context/SKILL.md`           |
| Work in the Text-providers area (10 symbols)      | `.claude/skills/generated/text-providers/SKILL.md`          |
| Work in the State area (5 symbols)                | `.claude/skills/generated/state/SKILL.md`                   |
| Work in the Guidelines area (5 symbols)           | `.claude/skills/generated/guidelines/SKILL.md`              |
| Work in the Stream area (5 symbols)               | `.claude/skills/generated/stream/SKILL.md`                  |
| Work in the Auth area (4 symbols)                 | `.claude/skills/generated/auth/SKILL.md`                    |
| Work in the Punctuality area (4 symbols)          | `.claude/skills/generated/punctuality/SKILL.md`             |

<!-- gitnexus:end -->

<!-- graft:start -->

## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).

<!-- graft:end -->
