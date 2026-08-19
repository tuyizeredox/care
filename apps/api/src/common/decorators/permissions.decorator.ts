import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../constants/permissions';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Requires the authenticated user to hold *every* listed permission.
 * Effective permissions = role permissions + user grants - user revocations.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
