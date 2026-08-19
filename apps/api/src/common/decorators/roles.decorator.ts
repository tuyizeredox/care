import { SetMetadata } from '@nestjs/common';
import { RoleKey } from '../constants/roles';

export const ROLES_KEY = 'requiredRoles';

/** Requires the authenticated user to hold one of the listed roles. */
export const RequireRoles = (...roles: RoleKey[]) => SetMetadata(ROLES_KEY, roles);
