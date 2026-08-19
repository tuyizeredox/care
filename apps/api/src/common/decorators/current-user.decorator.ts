import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Injects the authenticated principal resolved by JwtStrategy.
 * `@CurrentUser('id')` returns a single property.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user as AuthenticatedUser;
    return data ? user?.[data] : user;
  },
);
