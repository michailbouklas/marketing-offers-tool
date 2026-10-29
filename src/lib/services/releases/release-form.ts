import { z } from "zod";

/**
 * Zod + superforms schema for publishing a release on /admin/features.
 * The build version is deliberately NOT a form field: the server stamps it
 * from `APP_BUILD_VERSION` so a client can never choose it.
 */

export const RELEASE_TITLE_MAX_LENGTH = 200;
export const RELEASE_BODY_MAX_LENGTH = 50_000;

export const releaseFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the release a title.")
    .max(
      RELEASE_TITLE_MAX_LENGTH,
      `Keep the title under ${RELEASE_TITLE_MAX_LENGTH} characters.`,
    ),
  body: z
    .string()
    .trim()
    .min(1, "Describe what changed (markdown is supported).")
    .max(
      RELEASE_BODY_MAX_LENGTH,
      `Keep the notes under ${RELEASE_BODY_MAX_LENGTH} characters.`,
    ),
});

export type ReleaseFormData = z.infer<typeof releaseFormSchema>;

export type ReleaseActionMessage = {
  type: "success" | "error";
  text: string;
};

export function getDefaultReleaseFormData(): ReleaseFormData {
  return { title: "", body: "" };
}

/** CRLF / CR -> LF so stored markdown is identical whichever OS the author used. */
export function normalizeReleaseBody(body: string): string {
  return body.replace(/\r\n?/g, "\n").trim();
}
