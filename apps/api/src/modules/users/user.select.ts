import { Prisma } from '@prisma/client';

/** Minimal shape used for avatars, owner chips and mention lists. */
export const USER_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  avatarUrl: true,
  jobTitle: true,
  position: { select: { id: true, title: true, level: true } },
  department: { select: { id: true, name: true, code: true, color: true } },
} satisfies Prisma.UserSelect;

/** Full profile shape. `passwordHash` is never included, by construction. */
export const USER_PROFILE_SELECT = {
  ...USER_SUMMARY_SELECT,
  phone: true,
  bio: true,
  status: true,
  timezone: true,
  locale: true,
  lastLoginAt: true,
  emailVerified: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
  roleId: true,
  departmentId: true,
  positionId: true,
  managerId: true,
  role: { select: { id: true, key: true, name: true, level: true } },
  manager: { select: USER_SUMMARY_SELECT },
} satisfies Prisma.UserSelect;

export type UserSummary = Prisma.UserGetPayload<{ select: typeof USER_SUMMARY_SELECT }>;
export type UserProfile = Prisma.UserGetPayload<{ select: typeof USER_PROFILE_SELECT }>;

export const fullName = (user: { firstName: string; lastName: string }): string =>
  `${user.firstName} ${user.lastName}`.trim();
