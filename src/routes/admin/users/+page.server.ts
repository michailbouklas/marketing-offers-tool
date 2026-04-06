import { fail } from "@sveltejs/kit";
import { message, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { requireAdminUser } from "$lib/server/auth-guards";
import {
  createUserFormSchema,
  editUserFormSchema,
  getDefaultCreateUserFormData,
  getDefaultEditUserFormData,
  type UserEditorActionMessage,
} from "$lib/services/user-editor-form";
import { listBrands } from "$lib/services/brands.server";
import { createUser, listUsers, updateUser } from "$lib/services/users.server";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await requireAdminUser(event);

  const [users, brands, createForm, editForm] = await Promise.all([
    listUsers(),
    listBrands({ active: true }),
    superValidate(getDefaultCreateUserFormData(), zod4(createUserFormSchema), {
      errors: false,
      id: "create-user",
    }),
    superValidate(getDefaultEditUserFormData(), zod4(editUserFormSchema), {
      errors: false,
      id: "edit-user",
    }),
  ]);

  return {
    users,
    brands,
    createForm,
    editForm,
  };
};

export const actions: Actions = {
  createUser: async (event) => {
    await requireAdminUser(event);

    const formData = await event.request.formData();
    const form = await superValidate(formData, zod4(createUserFormSchema), {
      id: "create-user",
    });

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await createUser(form.data, event.request.headers);
    } catch (error) {
      return message<UserEditorActionMessage>(
        form,
        {
          type: "error",
          text:
            error instanceof Error ? error.message : "Unable to create user.",
        },
        { status: 400 },
      );
    }

    return message<UserEditorActionMessage>(form, {
      type: "success",
      text: "User created.",
    });
  },

  updateUser: async (event) => {
    await requireAdminUser(event);

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
          text:
            error instanceof Error ? error.message : "Unable to update user.",
        },
        { status: 400 },
      );
    }

    return message<UserEditorActionMessage>(form, {
      type: "success",
      text: "User updated.",
    });
  },
};
