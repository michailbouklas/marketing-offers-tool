import { prisma } from "$lib/server/prisma";
import type { GoogleReviewsPrefStateValue } from "$lib/services/google-reviews/google-reviews";

/**
 * Per-user monitor/ignore preferences for Google businesses. Provisioned for
 * the phase-2 customizable dashboard — not wired into any page yet.
 */

/** Map of `businessCid` → monitor state for one user. */
export async function getUserBusinessPrefs(userId: string) {
  const prefs = await prisma.google_reviews_user_business_pref.findMany({
    where: { userId },
    select: {
      businessCid: true,
      state: true,
    },
  });

  return new Map<string, GoogleReviewsPrefStateValue>(
    prefs.map((pref) => [pref.businessCid, pref.state]),
  );
}

/**
 * Upserts the user's monitor/ignore preference for one business; passing
 * `null` removes the row (back to the unmonitored default).
 */
export async function setBusinessPref(
  userId: string,
  businessCid: string,
  state: GoogleReviewsPrefStateValue | null,
) {
  if (state === null) {
    await prisma.google_reviews_user_business_pref.deleteMany({
      where: { userId, businessCid },
    });
    return;
  }

  await prisma.google_reviews_user_business_pref.upsert({
    where: {
      userId_businessCid: {
        userId,
        businessCid,
      },
    },
    create: {
      userId,
      businessCid,
      state,
    },
    update: {
      state,
    },
  });
}
