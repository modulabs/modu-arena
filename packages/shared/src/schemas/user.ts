import { z } from 'zod';

/**
 * User Zod schemas for validation
 * Self-hosted auth: username + password (no Clerk)
 */

export const UserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(50),
  email: z.string().email().nullable(),
  displayName: z.string().nullable(),
  githubUsername: z.string().nullable(),
  githubAvatarUrl: z.string().url().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateUserSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Username must be alphanumeric with hyphens/underscores'),
  password: z.string().min(8).max(128),
  email: z.string().email().optional(),
  displayName: z.string().max(100).optional(),
});

export const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().max(100).optional(),
  githubUsername: z.string().optional(),
  privacyMode: z.boolean().optional(),
});

export const SessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  toolTypeId: z.string().min(1),
  sessionHash: z.string().min(1),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
});

export type UserSchemaType = z.infer<typeof UserSchema>;
export type CreateUserSchemaType = z.infer<typeof CreateUserSchema>;
export type LoginSchemaType = z.infer<typeof LoginSchema>;
export type UpdateUserSchemaType = z.infer<typeof UpdateUserSchema>;
export type SessionSchemaType = z.infer<typeof SessionSchema>;
