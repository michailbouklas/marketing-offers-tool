import { z } from "zod";

export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(100, "Name must be 100 characters or fewer."),
});

export type ProfileSchema = typeof profileSchema;

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Please enter your current password."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type PasswordSchema = typeof passwordSchema;
