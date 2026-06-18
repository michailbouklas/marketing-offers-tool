import type { QueueRow } from "$lib/services/notifications/types";

/**
 * Pure formatting for the digest email. Given one user's new-offer rows (across
 * all their monitored restaurants) and a `restaurantId → name` map, produce the
 * subject and the HTML/text bodies, grouped by restaurant for readability.
 *
 * No I/O — this is unit-testable in isolation. The `.server` suffix only keeps
 * it out of the client bundle alongside its siblings.
 */

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function restaurantLabel(
  restaurantId: number,
  restaurantNames: Map<number, string>,
): string {
  return restaurantNames.get(restaurantId) ?? `Restaurant #${restaurantId}`;
}

/** Group rows by restaurant id, preserving first-seen order of restaurants. */
function groupByRestaurant(rows: QueueRow[]): Map<number, QueueRow[]> {
  const groups = new Map<number, QueueRow[]>();

  for (const row of rows) {
    const bucket = groups.get(row.restaurantId);

    if (bucket) {
      bucket.push(row);
    } else {
      groups.set(row.restaurantId, [row]);
    }
  }

  return groups;
}

export function buildDigestEmail(
  rows: QueueRow[],
  restaurantNames: Map<number, string>,
): BuiltEmail {
  const offerCount = rows.length;
  const groups = groupByRestaurant(rows);
  const restaurantCount = groups.size;

  const subject =
    offerCount === 1
      ? "1 new competitor offer"
      : `${offerCount} new competitor offers`;

  const intro =
    restaurantCount === 1
      ? `There ${offerCount === 1 ? "is" : "are"} ${offerCount} new offer${
          offerCount === 1 ? "" : "s"
        } at a restaurant you monitor.`
      : `There are ${offerCount} new offers across ${restaurantCount} restaurants you monitor.`;

  const textSections: string[] = [intro, ""];
  const htmlSections: string[] = [`<p>${escapeHtml(intro)}</p>`];

  for (const [restaurantId, restaurantRows] of groups) {
    const label = restaurantLabel(restaurantId, restaurantNames);

    textSections.push(`${label} (${restaurantRows.length}):`);
    htmlSections.push(
      `<h3 style="margin:16px 0 4px">${escapeHtml(label)}</h3>`,
    );

    const htmlItems: string[] = [];

    for (const row of restaurantRows) {
      const title = row.title.trim() || "(untitled offer)";
      const description = row.description?.trim();

      textSections.push(
        description ? `  • ${title} — ${description}` : `  • ${title}`,
      );

      htmlItems.push(
        `<li><strong>${escapeHtml(title)}</strong>${
          description ? `<br/><span>${escapeHtml(description)}</span>` : ""
        }</li>`,
      );
    }

    htmlSections.push(`<ul>${htmlItems.join("")}</ul>`);
    textSections.push("");
  }

  const text = textSections.join("\n").trimEnd();
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#111">${htmlSections.join(
    "",
  )}</div>`;

  return { subject, html, text };
}
