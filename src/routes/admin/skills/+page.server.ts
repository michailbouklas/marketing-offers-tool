import { fail, redirect, type RequestEvent } from "@sveltejs/kit";
import { message, superValidate } from "sveltekit-superforms/server";
import { zod4 } from "sveltekit-superforms/adapters";
import { hasSuperUserRole, requirePermission } from "$lib/server/auth-guards";
import {
  createAgentSkill,
  deleteAgentSkill,
  listAgentSkills,
  listBuiltInSkillNames,
  updateAgentSkill,
  type SkillViewer,
} from "$lib/services/skills/agent-skills.server";
import { ASSISTANTS } from "$lib/services/skills/assistants";
import {
  createSkillFormSchema,
  deleteSkillFormSchema,
  editSkillFormSchema,
  getDefaultSkillFormData,
  type SkillActionMessage,
} from "$lib/services/skills/skill-editor-form";
import type { Actions, PageServerLoad } from "./$types";

/**
 * The /admin hooks gate only checks `adminSectionRoles`; every load and action
 * here additionally requires `skill: ["manage"]` (admin, brandManager,
 * superUser). Users without the superUser role are scoped to the skills they
 * created.
 */
async function resolveViewer(event: RequestEvent): Promise<SkillViewer> {
  const { user } = await requirePermission(event, { skill: ["manage"] });
  if (!user) redirect(302, "/login");
  return { userId: user.id, isSuperUser: await hasSuperUserRole(event) };
}

export const load: PageServerLoad = async (event) => {
  const viewer = await resolveViewer(event);

  const [skills, builtInNames, createForm, editForm, deleteForm] =
    await Promise.all([
      listAgentSkills(viewer),
      listBuiltInSkillNames(),
      superValidate(getDefaultSkillFormData(), zod4(createSkillFormSchema), {
        errors: false,
        id: "create-skill",
      }),
      superValidate(
        { ...getDefaultSkillFormData(), id: 0 },
        zod4(editSkillFormSchema),
        { errors: false, id: "edit-skill" },
      ),
      superValidate({ id: 0 }, zod4(deleteSkillFormSchema), {
        errors: false,
        id: "delete-skill",
      }),
    ]);

  return {
    skills,
    builtInNames,
    assistants: ASSISTANTS,
    isSuperUser: viewer.isSuperUser,
    createForm,
    editForm,
    deleteForm,
  };
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export const actions: Actions = {
  createSkill: async (event) => {
    const viewer = await resolveViewer(event);
    const form = await superValidate(
      event.request,
      zod4(createSkillFormSchema),
      { id: "create-skill" },
    );

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await createAgentSkill(form.data, viewer);
    } catch (error) {
      return message<SkillActionMessage>(
        form,
        { type: "error", text: errorText(error, "Could not create skill.") },
        { status: 400 },
      );
    }

    return message<SkillActionMessage>(form, {
      type: "success",
      text: "Skill created.",
    });
  },

  updateSkill: async (event) => {
    const viewer = await resolveViewer(event);
    const form = await superValidate(event.request, zod4(editSkillFormSchema), {
      id: "edit-skill",
    });

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await updateAgentSkill(form.data.id, form.data, viewer);
    } catch (error) {
      return message<SkillActionMessage>(
        form,
        { type: "error", text: errorText(error, "Could not update skill.") },
        { status: 400 },
      );
    }

    return message<SkillActionMessage>(form, {
      type: "success",
      text: "Skill saved.",
    });
  },

  deleteSkill: async (event) => {
    const viewer = await resolveViewer(event);
    const form = await superValidate(
      event.request,
      zod4(deleteSkillFormSchema),
      { id: "delete-skill" },
    );

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      await deleteAgentSkill(form.data.id, viewer);
    } catch (error) {
      return message<SkillActionMessage>(
        form,
        { type: "error", text: errorText(error, "Could not delete skill.") },
        { status: 400 },
      );
    }

    return message<SkillActionMessage>(form, {
      type: "success",
      text: "Skill deleted.",
    });
  },
};
