import { prisma } from "$lib/server/prisma";
import type { CompetitionTrackStateValue } from "$lib/services/competition/competition";

export type RestaurantPrefKey = {
  processorId: number;
  restaurantId: number;
};

/** Map of `${processorId}:${restaurantId}` → track state for one user. */
export async function getUserRestaurantPrefs(userId: string) {
  const prefs = await prisma.competition_user_restaurant_pref.findMany({
    where: { userId },
    select: {
      processorId: true,
      restaurantId: true,
      state: true,
    },
  });

  return new Map<string, CompetitionTrackStateValue>(
    prefs.map((pref) => [
      `${pref.processorId}:${pref.restaurantId}`,
      pref.state,
    ]),
  );
}

/**
 * Upserts the user's track/ignore preference for one restaurant; passing
 * `null` removes the row (back to the untracked default).
 */
export async function setRestaurantPref(
  userId: string,
  { processorId, restaurantId }: RestaurantPrefKey,
  state: CompetitionTrackStateValue | null,
) {
  const where = {
    userId_processorId_restaurantId: {
      userId,
      processorId,
      restaurantId,
    },
  };

  if (state === null) {
    await prisma.competition_user_restaurant_pref.deleteMany({
      where: { userId, processorId, restaurantId },
    });
    return;
  }

  await prisma.competition_user_restaurant_pref.upsert({
    where,
    create: {
      userId,
      processorId,
      restaurantId,
      state,
    },
    update: {
      state,
    },
  });
}
