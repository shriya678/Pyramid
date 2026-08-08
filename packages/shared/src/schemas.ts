import { z } from 'zod';
import { AccentColor, DefaultView, Priority, ResourceType, Role, ThemeMode } from './enums';

const cuid = () => z.string().min(1);
const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();

// --- Auth ---

export const RefreshDto = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshDto = z.infer<typeof RefreshDto>;

// --- Workspace ---

export const CreateWorkspaceDto = z.object({
  name: trimmed(80),
});
export type CreateWorkspaceDto = z.infer<typeof CreateWorkspaceDto>;

// --- Status ---

export const CreateStatusDto = z.object({
  name: trimmed(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  order: z.number().int(),
});
export type CreateStatusDto = z.infer<typeof CreateStatusDto>;

export const UpdateStatusDto = CreateStatusDto.partial();
export type UpdateStatusDto = z.infer<typeof UpdateStatusDto>;

// --- Project ---

export const CreateProjectDto = z.object({
  name: trimmed(120),
  description: optionalText(2000),
  priority: z.enum(Object.values(Priority) as [string, ...string[]]).optional(),
  leadUserId: cuid().optional(),
  dueDate: z.string().datetime().optional(),
});
export type CreateProjectDto = z.infer<typeof CreateProjectDto>;

export const UpdateProjectDto = CreateProjectDto.partial();
export type UpdateProjectDto = z.infer<typeof UpdateProjectDto>;

// --- Task ---

export const CreateTaskDto = z.object({
  title: trimmed(200),
  description: optionalText(10000),
  statusId: cuid(),
  priority: z.enum(Object.values(Priority) as [string, ...string[]]).optional(),
  projectId: cuid().optional(),
  parentTaskId: cuid().optional(),
  assigneeIds: z.array(cuid()).optional(),
  labelIds: z.array(cuid()).optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
});
export type CreateTaskDto = z.infer<typeof CreateTaskDto>;

export const UpdateTaskDto = CreateTaskDto.partial().extend({
  orderInColumn: z.number().optional(),
});
export type UpdateTaskDto = z.infer<typeof UpdateTaskDto>;

export const TaskFilterQuery = z.object({
  q: z.string().optional(),
  statusIds: z.array(cuid()).optional(),
  priority: z.array(z.enum(Object.values(Priority) as [string, ...string[]])).optional(),
  labelIds: z.array(cuid()).optional(),
  assigneeIds: z.array(cuid()).optional(),
  projectId: cuid().optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
});
export type TaskFilterQuery = z.infer<typeof TaskFilterQuery>;

// --- Label ---

export const CreateLabelDto = z.object({
  name: trimmed(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type CreateLabelDto = z.infer<typeof CreateLabelDto>;

// --- Comment ---

export const CreateCommentDto = z.object({
  body: trimmed(5000),
  parentCommentId: cuid().optional(),
});
export type CreateCommentDto = z.infer<typeof CreateCommentDto>;

// --- Resource ---

export const CreateResourceDto = z.object({
  type: z.enum([ResourceType.LINK, ResourceType.FILE]),
  url: z.string().url().optional(), // required when type === LINK
  cloudinaryKey: z.string().optional(), // required when type === FILE
  name: trimmed(200),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type CreateResourceDto = z.infer<typeof CreateResourceDto>;

// --- User preference ---

export const UpdatePreferenceDto = z.object({
  theme: z.enum([ThemeMode.LIGHT, ThemeMode.DARK]).optional(),
  accentColor: z.enum(Object.values(AccentColor) as [string, ...string[]]).optional(),
  defaultView: z.enum([DefaultView.BOARD, DefaultView.LIST]).optional(),
  boardFieldsShown: z.record(z.string(), z.boolean()).optional(),
  listFieldsShown: z.record(z.string(), z.boolean()).optional(),
  projectListFieldsShown: z.record(z.string(), z.boolean()).optional(),
});
export type UpdatePreferenceDto = z.infer<typeof UpdatePreferenceDto>;

// --- Profile ---

export const UpdateProfileDto = z.object({
  fullName: trimmed(80).optional(),
  username: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
  title: optionalText(80),
  avatarUrl: z.string().url().optional(),
});
export type UpdateProfileDto = z.infer<typeof UpdateProfileDto>;

// --- Member role ---

export const UpdateMemberRoleDto = z.object({
  role: z.enum([Role.OWNER, Role.ADMIN, Role.MEMBER]),
});
export type UpdateMemberRoleDto = z.infer<typeof UpdateMemberRoleDto>;
