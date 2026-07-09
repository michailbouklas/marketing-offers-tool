/**
 * Categorical color palette for free-text operation reasons (cancellation and
 * closure reasons). Browser-safe.
 *
 * The app's `--chart-1..5` design tokens are a low-chroma warm-gray ramp — fine
 * for a single trend line, but adjacent categories are indistinguishable, which
 * breaks down for the many free-text reasons the portal can emit. These are
 * distinct mid-lightness OKLCH hues that stay legible as chart fills / bar fills
 * in both light and dark themes.
 *
 * Colors are assigned by a reason's index in a stably-sorted list, so the same
 * reason keeps the same color across the bar breakdown and the stacked-area
 * trend on a given view.
 */
export const REASON_PALETTE = [
  "oklch(0.62 0.19 25)", // red
  "oklch(0.70 0.16 60)", // orange
  "oklch(0.75 0.15 95)", // amber
  "oklch(0.68 0.17 145)", // green
  "oklch(0.66 0.13 195)", // teal
  "oklch(0.60 0.16 245)", // blue
  "oklch(0.55 0.20 290)", // indigo
  "oklch(0.62 0.21 330)", // magenta
  "oklch(0.66 0.15 15)", // rose
  "oklch(0.58 0.10 120)", // olive
] as const;

/** Stable color for a reason by its (sorted) index; cycles past the palette length. */
export function reasonColor(index: number): string {
  return REASON_PALETTE[index % REASON_PALETTE.length];
}
