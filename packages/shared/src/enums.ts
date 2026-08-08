export const Priority = {
  NONE: 'NONE',
  URGENT: 'URGENT',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ResourceType = {
  LINK: 'LINK',
  FILE: 'FILE',
} as const;
export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];

export const ActivityType = {
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  PRIORITY_CHANGED: 'PRIORITY_CHANGED',
  DUE_DATE_CHANGED: 'DUE_DATE_CHANGED',
  MEMBER_ADDED: 'MEMBER_ADDED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
  LABEL_ADDED: 'LABEL_ADDED',
  LABEL_REMOVED: 'LABEL_REMOVED',
  COMMENT_ADDED: 'COMMENT_ADDED',
  RESOURCE_ADDED: 'RESOURCE_ADDED',
  USER_UPDATE: 'USER_UPDATE',
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export const NotificationType = {
  MENTION: 'MENTION',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const ThemeMode = {
  LIGHT: 'LIGHT',
  DARK: 'DARK',
} as const;
export type ThemeMode = (typeof ThemeMode)[keyof typeof ThemeMode];

export const AccentColor = {
  AMBER: 'AMBER',
  BLUE: 'BLUE',
  PINK: 'PINK',
  ROSE: 'ROSE',
  EMERALD: 'EMERALD',
  BLACK: 'BLACK',
} as const;
export type AccentColor = (typeof AccentColor)[keyof typeof AccentColor];

export const DefaultView = {
  BOARD: 'BOARD',
  LIST: 'LIST',
} as const;
export type DefaultView = (typeof DefaultView)[keyof typeof DefaultView];
