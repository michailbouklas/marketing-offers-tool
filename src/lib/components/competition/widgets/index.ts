import type { Component } from "svelte";
import ActiveOffersByAggregatorWidget from "./active-offers-by-aggregator-widget.svelte";
import RecentOfferChangesWidget from "./recent-offer-changes-widget.svelte";
import StatCardsWidget from "./stat-cards-widget.svelte";
import type { CompetitionWidgetType } from "./types";

export {
  competitionWidgetTypes,
  type CompetitionWidgetProps,
  type CompetitionWidgetType,
} from "./types";

/**
 * Widget registry keyed by the `competition_dashboard_widget.widgetType`
 * value. Phase 2 resolves a user's stored widget rows through this map; phase
 * 1 renders `defaultCompetitionWidgetOrder` for everyone.
 */
export const competitionWidgetRegistry: Record<
  CompetitionWidgetType,
  // Each widget declares its own `data` slice; the registry erases it.
  Component<never>
> = {
  "stat-cards": StatCardsWidget,
  "active-offers-by-aggregator": ActiveOffersByAggregatorWidget,
  "recent-offer-changes": RecentOfferChangesWidget,
};

export const defaultCompetitionWidgetOrder: CompetitionWidgetType[] = [
  "stat-cards",
  "active-offers-by-aggregator",
  "recent-offer-changes",
];
