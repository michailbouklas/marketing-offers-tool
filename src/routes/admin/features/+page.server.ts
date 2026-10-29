import { fail, redirect } from "@sveltejs/kit";
import { message, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { requirePermission } from "$lib/server/auth-guards";
import { getAppBuildVersion } from "$lib/server/env";
import {
  editReleaseFormSchema,
  getDefaultReleaseFormData,
  releaseFormSchema,
  type ReleaseActionMessage,
} from "$lib/services/releases/release-form";
import {
  createRelease,
  listReleases,
  updateRelease,
} from "$lib/services/releases/releases.server";
import type { Actions, PageServerLoad } from "./$types";

/**
 * /admin/features — publish and review release notes. The /admin hooks gate
 * only checks `adminSectionRoles`; load and action both require
 * `release: ["manage"]`, which only the superUser role holds.
 */
export const load: PageServerLoad = async (event) => {
  await requirePermission(event, { release: ["manage"] });

  const [releases, createForm, editForm] = await Promise.all([
    listReleases(),
    superValidate(getDefaultReleaseFormData(), zod4(releaseFormSchema), {
      errors: false,
      id: "create-release",
    }),
    superValidate(
      { ...getDefaultReleaseFormData(), id: 0 },
      zod4(editReleaseFormSchema),
      { errors: false, id: "edit-release" },
    ),
  ]);

  return {
    releases,
    createForm,
    editForm,
    buildVersion: getAppBuildVersion(),
  };
};

export const actions: Actions = {
  createRelease: async (event) => {
    const { user } = await requirePermission(event, { release: ["manage"] });
    if (!user) redirect(302, "/login");

    const form = await superValidate(event.request, zod4(releaseFormSchema), {
      id: "create-release",
    });

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      // Version always comes from the server's build env, never the client.
      await createRelease({
        ...form.data,
        version: getAppBuildVersion(),
        createdByUserId: user.id,
      });
    } catch (error) {
      console.error("[releases] publish failed:", error);
      return message<ReleaseActionMessage>(
        form,
        {
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Could not publish the release.",
        },
        { status: 400 },
      );
    }

    return message<ReleaseActionMessage>(form, {
      type: "success",
      text: "Release published.",
    });
  },

  /** Silent correction: no SSE event, no re-prompt, version unchanged. */
  updateRelease: async (event) => {
    await requirePermission(event, { release: ["manage"] });

    const form = await superValidate(
      event.request,
      zod4(editReleaseFormSchema),
      { id: "edit-release" },
    );

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await updateRelease(form.data);
    } catch (error) {
      console.error("[releases] update failed:", error);
      return message<ReleaseActionMessage>(
        form,
        {
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Could not update the release.",
        },
        { status: 400 },
      );
    }

    return message<ReleaseActionMessage>(form, {
      type: "success",
      text: "Release updated.",
    });
  },
};
