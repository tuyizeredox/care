import { PermissionKey } from '../constants/permissions';

/** The principal attached to every authenticated request. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleKey: string;
  roleLevel: number;
  departmentId: string | null;
  positionId: string | null;
  managerId: string | null;
  permissions: PermissionKey[];
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tokenType?: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}
