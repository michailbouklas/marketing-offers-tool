import { fail, type RequestEvent } from "@sveltejs/kit";
import { message, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { requirePermission } from "$lib/server/auth-guards";
import {
  editUserFormSchema,
  type UserEditorActionMessage,
} from "$lib/services/user-editor-form";
import {
  revokeUserSessions,
  setUserBanned,
  updateUser,
} from "$lib/services/users.server";

/**
 * Form actions shared by `/admin/users` and `/admin/users/[id]`, so the
 * list page and the details page edit/deactivate through the same code.
 */

async function updateUserAction(event: RequestEvent) {
  await requirePermission(event, { user: ["set-role"] });

  const formData = await event.request.formData();
  const form = await superValidate(formData, zod4(editUserFormSchema), {
    id: "edit-user",
  });

  if (!form.valid) {
    return fail(400, { form });
  }

  try {
    await updateUser(form.data.userId, form.data, event.request.headers);
  } catch (error) {
    return message<UserEditorActionMessage>(
      form,
      {
        type: "error",
        text: error instanceof Error ? error.message : "Unable to update user.",
      },
      { status: 400 },
    );
  }

  return message<UserEditorActionMessage>(form, {
    type: "success",
    text: "User updated.",
  });
}

function banAction(banned: boolean) {
  return async (event: RequestEvent) => {
    await requirePermission(event, { user: ["ban"] });

    const userId = (await event.request.formData()).get("userId");
    if (typeof userId !== "string" || userId.length === 0) {
      return fail(400, { error: "Missing user id." });
    }

    try {
      await setUserBanned(userId, banned, event.request.headers);
    } catch (error) {
      return fail(400, {
        error:
          error instanceof Error ? error.message : "Unable to update the user.",
      });
    }

    return { success: true };
  };
}

async function revokeSessionsAction(event: RequestEvent) {
  await requirePermission(event, { session: ["revoke"] });

  const userId = (await event.request.formData()).get("userId");
  if (typeof userId !== "string" || userId.length === 0) {
    return fail(400, { error: "Missing user id." });
  }

  try {
    await revokeUserSessions(userId, event.request.headers);
  } catch (error) {
    return fail(400, {
      error:
        error instanceof Error ? error.message : "Unable to sign the user out.",
    });
  }

  return { success: true };
}

export const userAdminActions = {
  updateUser: updateUserAction,
  deactivateUser: banAction(true),
  reactivateUser: banAction(false),
  revokeSessions: revokeSessionsAction,
};
