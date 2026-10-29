import nodemailer, { type Transporter } from "nodemailer";
import { getNotificationsEnv } from "$lib/server/notifications/notifications-env";

/**
 * SMTP transport for outbound mail (the offer-notification digest and the
 * release-notes "notify users" emails). Built lazily from `notifications-env` and cached on `globalThis` so
 * a single connection pool is reused across requests and dev HMR reloads. The
 * caller is expected to have checked `hasNotificationsTransport()` first; this
 * module throws if SMTP is unconfigured.
 */

const globalForMailer = globalThis as typeof globalThis & {
  mailTransporter?: Transporter;
  mailTransporterConfigKey?: string;
};

function getTransporter(): Transporter {
  const config = getNotificationsEnv();

  if (!config.SMTP_HOST) {
    throw new Error("Missing required environment variable: SMTP_HOST");
  }

  const configKey = JSON.stringify({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    user: config.SMTP_USER ?? null,
  });

  if (
    globalForMailer.mailTransporter &&
    globalForMailer.mailTransporterConfigKey === configKey
  ) {
    return globalForMailer.mailTransporter;
  }

  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    // Only attach credentials when a user is configured; many internal relays
    // accept unauthenticated mail from trusted hosts.
    auth: config.SMTP_USER
      ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? "" }
      : undefined,
  });

  globalForMailer.mailTransporter = transporter;
  globalForMailer.mailTransporterConfigKey = configKey;

  return transporter;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Kept for the digest caller; same shape as `OutboundEmail`. */
export type DigestEmail = OutboundEmail;

/**
 * Send one email through the configured SMTP transport. Rejects on
 * transport/delivery failure so callers can isolate per-recipient failures
 * (the digest advances its cursor on that basis; the release notifier reports
 * the failed addresses).
 */
export async function sendEmail(email: OutboundEmail): Promise<void> {
  const config = getNotificationsEnv();

  if (!config.NOTIFICATIONS_FROM_EMAIL) {
    throw new Error(
      "Missing required environment variable: NOTIFICATIONS_FROM_EMAIL",
    );
  }

  await getTransporter().sendMail({
    from: config.NOTIFICATIONS_FROM_EMAIL,
    to: email.to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

/** Digest-specific name retained for `offer-digest.server.ts`. */
export const sendDigestEmail = sendEmail;
