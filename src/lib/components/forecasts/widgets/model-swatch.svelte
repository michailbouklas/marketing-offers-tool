<script lang="ts">
  import type { ModelStroke } from "$lib/services/forecasts/forecast-types";

  /**
   * Colour + dash swatch for one forecast model. The `--chart-*` ramp is
   * near-neutral, so the dash pattern is what really tells models apart.
   */
  let {
    stroke,
    label,
    class: className = "",
  }: {
    stroke: ModelStroke;
    /** Accessible name; omit when the swatch is purely decorative. */
    label?: string;
    class?: string;
  } = $props();
</script>

<svg
  class="h-3 w-7 shrink-0 {className}"
  viewBox="0 0 28 12"
  role={label ? "img" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : "true"}
>
  <line
    x1="1"
    y1="6"
    x2="27"
    y2="6"
    stroke={stroke.color}
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-dasharray={stroke.dash || undefined}
  />
</svg>
