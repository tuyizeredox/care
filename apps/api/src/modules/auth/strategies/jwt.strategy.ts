import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccessControlService } from '../../../common/services/access-control.service';
import { AuthenticatedUser, JwtPayload } from '../../../common/types/authenticated-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret') as string,
    });
  }

  /**
   * Re-reads the user on every request so that role/permission changes and
   * account suspensions take effect immediately rather than at token expiry.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (payload.tokenType === 'refresh') {
      throw new UnauthorizedException('Invalid token.');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, status: 'ACTIVE' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        roleId: true,
        departmentId: true,
        positionId: true,
        managerId: true,
        role: { select: { key: true, level: true } },
      },
    });
    if (!user) throw new UnauthorizedException('Your account is no longer active.');

    const permissions = await this.accessControl.getEffectivePermissions(user.id);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roleId: user.roleId,
      roleKey: user.role.key,
      roleLevel: user.role.level,
      departmentId: user.departmentId,
      positionId: user.positionId,
      managerId: user.managerId,
      permissions,
    };
  }
}
