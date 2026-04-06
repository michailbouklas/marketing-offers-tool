export type LandingAction = {
  label: string;
  href: string;
  variant?: "default" | "outline" | "secondary";
};

export type LandingStat = {
  value: string;
  label: string;
};

export type HeroPreviewItem = {
  label: string;
  value: string;
  note: string;
};

export type WorkflowCard = {
  stage: string;
  title: string;
  description: string;
  points: readonly string[];
};

export type FoundationCard = {
  kicker: string;
  title: string;
  description: string;
};

export const landingContent = {
  hero: {
    eyebrow: "Aggregator Offers Tool",
    title: "Make every offer visible before it slips past the team.",
    description:
      "A calmer review surface for collecting campaigns, comparing tradeoffs, and moving the strongest offers forward without spreadsheet sprawl.",
    tags: ["Tailwind v4", "Svelte 5", "shadcn-svelte ready"],
    primaryAction: {
      label: "Explore workflow",
      href: "#workflow",
      variant: "default",
    },
    secondaryAction: {
      label: "Inspect foundation",
      href: "#foundation",
      variant: "outline",
    },
    stats: [
      { value: "1", label: "shared intake surface" },
      { value: "3", label: "clear decision lanes" },
      { value: "24/7", label: "searchable context" },
    ],
    preview: [
      {
        label: "Intake",
        value: "New partner offers",
        note: "Grouped by urgency and source",
      },
      {
        label: "Review",
        value: "Compare timing and overlap",
        note: "Designed for quick triage",
      },
      {
        label: "Move",
        value: "Promote the best options",
        note: "Shared context stays attached",
      },
    ],
  },
  workflow: {
    eyebrow: "Workflow",
    title: "Built for the messy middle between discovery and decision.",
    description:
      "The layout favors fast scanning first, deeper review second, and handoff clarity throughout.",
    cards: [
      {
        stage: "01 / Capture",
        title: "Pull scattered offers into one queue.",
        description:
          "Centralize incoming opportunities so the team starts from one trusted list instead of fragmented notes.",
        points: [
          "Single intake lens",
          "Status-first sorting",
          "Context before action",
        ],
      },
      {
        stage: "02 / Compare",
        title: "Read patterns without tab fatigue.",
        description:
          "Surface overlap, timing pressure, and channel conflicts quickly so strong offers rise earlier.",
        points: ["Overlap spotting", "Priority cues", "Readable summaries"],
      },
      {
        stage: "03 / Ship",
        title: "Move winners forward with confidence.",
        description:
          "Keep the decision trail attached so downstream owners understand why an offer made the cut.",
        points: [
          "Clear handoff state",
          "Reusable review notes",
          "Less re-explaining",
        ],
      },
    ],
  },
  foundation: {
    eyebrow: "Foundation",
    title: "Ready for shadcn growth instead of one-off UI drift.",
    description:
      "The project now has the base pieces needed to expand the interface while keeping styling, theming, and composition consistent.",
    cards: [
      {
        kicker: "Theme tokens",
        title: "Tailwind v4 colors live in CSS-first theme variables.",
        description:
          "The app uses the shadcn-style token map, dark variant, and animation import expected by newer components.",
      },
      {
        kicker: "Composable UI",
        title: "Button, Badge, and Card are installed and ready.",
        description:
          "New screens can grow from reusable primitives instead of bespoke markup stitched together page by page.",
      },
      {
        kicker: "Project hygiene",
        title: "Formatting and utility scaffolding are in place.",
        description:
          "The `cn` helper, `components.json`, and `svelte-autofixer` command keep future additions aligned with the stack.",
      },
    ],
    cta: {
      label: "Start building screens",
      href: "#top",
      variant: "secondary",
    },
  },
} as const;
