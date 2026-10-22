import {
  hasPermission,
  hasSuperUserRole,
  requireAdminSection,
} from "$lib/server/auth-guards";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requireAdminSection(event);

  const [
    pendingSubmissions,
    dimOffers,
    users,
    brands,
    imageUsage,
    metrics,
    promptGallery,
    urlsToScrape,
    chatUsage,
    googleReviews,
    liveMonitoring,
  ] = await Promise.all([
    hasPermission(event, { submission: ["approve"] }),
    hasPermission(event, { submission: ["approve"] }),
    hasPermission(event, { user: ["list"] }),
    hasPermission(event, { brand: ["manage"] }),
    hasPermission(event, { imageGenerator: ["view-usage"] }),
    hasPermission(event, { metrics: ["view"] }),
    hasPermission(event, { promptGallery: ["manage"] }),
    hasPermission(event, { urlsToScrape: ["manage"] }),
    hasSuperUserRole(event),
    hasPermission(event, { googleReviews: ["manage"] }),
    hasSuperUserRole(event),
  ]);

  return {
    access: {
      pendingSubmissions,
      dimOffers,
      users,
      brands,
      imageUsage,
      metrics,
      promptGallery,
      urlsToScrape,
      chatUsage,
      googleReviews,
      liveMonitoring,
    },
  };
};
