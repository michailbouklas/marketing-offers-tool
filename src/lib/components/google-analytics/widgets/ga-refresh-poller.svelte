<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import type {
    GoogleAnalyticsDashboardStatus,
    GoogleAnalyticsRange,
  } from "$lib/services/google-analytics/google-analytics";

  /** How often an open tab asks whether the queued reports have landed. */
  const POLL_INTERVAL_MS = 30_000;

  /**
   * Renders nothing. While some widgets are pending it polls the dashboard
   * status (no Google call) and reloads the page data once every report is
   * cached; the latest status is handed to the page for the "next retry" hint.
   */
  let {
    brandId,
    propertyRowId,
    range,
    active,
    onstatus,
  }: {
    brandId: number;
    propertyRowId: string;
    range: GoogleAnalyticsRange;
    /** True while at least one widget has no data yet. */
    active: boolean;
    onstatus?: (status: GoogleAnalyticsDashboardStatus | null) => void;
  } = $props();

  async function poll(signal: AbortSignal) {
    try {
      const params = new URLSearchParams({
        brand: String(brandId),
        property: propertyRowId,
        range,
      });
      const res = await fetch(
        `/api/google-analytics/dashboard-status?${params}`,
        {
          signal,
          headers: { accept: "application/json" },
        },
      );

      if (signal.aborted || !res.ok) return;

      const status = (await res.json()) as GoogleAnalyticsDashboardStatus;
      if (signal.aborted) return;

      onstatus?.(status);

      if (status.pendingKeys.length === 0) {
        await invalidateAll();
      }
    } catch {
      // Network hiccup: the next tick tries again.
    }
  }

  $effect(() => {
    onstatus?.(null);

    if (!active) return;

    const controller = new AbortController();
    void poll(controller.signal);

    const tick = () => {
      if (document.visibilityState === "visible") {
        void poll(controller.signal);
      }
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);

    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  });
</script>
