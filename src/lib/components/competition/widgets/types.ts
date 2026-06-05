/**
 * Contract for `/competition` dashboard widgets.
 *
 * Phase 1 renders a hardcoded widget list; phase 2 will map the per-user
 * `competition_dashboard_widget` rows (widgetType → registry component,
 * settings Json → `settings` prop, ordered by `position`) onto the same
 * components, so keep widgets self-contained: a Card-wrapped component that
 * receives its data slice and optional `title` / `settings` overrides.
 */

export const competitionWidgetTypes = [
  "stat-cards",
  "active-offers-by-aggregator",
  "recent-offer-changes",
] as const;

export type CompetitionWidgetType = (typeof competitionWidgetTypes)[number];

export type CompetitionWidgetProps<TSettings = Record<string, unknown>> = {
  /** Optional title override; every widget ships a sensible default. */
  title?: string;
  /** Widget-specific configuration (phase 2: the `settings` Json column). */
  settings?: TSettings;
};
