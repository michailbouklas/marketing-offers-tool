import type { ImageModelConfig } from "./config";

/**
 * Display helpers for image model ids.
 *
 * Model ids come in two shapes: namespaced (`"google/nano-banana-2"`) and
 * bare (`"gpt-image-1"`). These helpers split and prettify them for the model
 * selector dialog and the selected-model pills. Pure / framework-free.
 */

export interface ModelIdParts {
  /** The org/namespace before the first slash, or null for bare ids. */
  org: string | null;
  /** The model name (everything after the first slash, or the whole id). */
  name: string;
}

/** Split a model id into its org and name on the first slash. */
export function splitModelId(id: string): ModelIdParts {
  const slash = id.indexOf("/");
  if (slash === -1) return { org: null, name: id };
  return {
    org: id.slice(0, slash) || null,
    name: id.slice(slash + 1) || id,
  };
}

/** Short, human-friendly label for a model (the name part of the id). */
export function modelLabel(id: string): string {
  return splitModelId(id).name;
}

/** Capability badge labels derived from a model's config flags. */
export function modelCapabilityBadges(model: ImageModelConfig): string[] {
  const badges: string[] = [];
  if (model.supportsQuality) badges.push("Quality");
  if (model.supportsReferences) badges.push("References");
  if (model.supportsMask) badges.push("Mask");
  return badges;
}
