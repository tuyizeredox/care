import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../../common/services/access-control.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../../common/types/authenticated-user';
import { USER_PROFILE_SELECT } from '../users/user.select';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly accessControl: AccessControlService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, ctx: RequestContext = {}) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, passwordHash: true, status: true, deletedAt: true },
    });

    // Compare against a dummy hash when the account does not exist so response
    // time does not disclose which email addresses are registered.
    const hash =
      user?.passwordHash ?? '$2a$12$C6UzMDM.H6dfI/f/IKcEe.KstpMEjHiaLtn3.p8VgOxCJZmxdVqmO';
    const passwordMatches = await bcrypt.compare(dto.password, hash);

    if (!user || !passwordMatches || user.deletedAt) {
      await this.audit.record({
        action: 'auth.login_failed',
        resourceType: 'User',
        resourceId: user?.id ?? null,
        summary: `Failed sign-in attempt for ${dto.email}`,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException('Incorrect email or password.');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('This account is not active. Contact your administrator.');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const tokens = await this.issueTokens(user.id, ctx);
    const profile = await this.me(user.id);

    await this.audit.record({
      actorId: user.id,
      action: 'auth.login',
      resourceType: 'User',
      resourceId: user.id,
      summary: `${profile.firstName} ${profile.lastName} signed in`,
      departmentId: profile.departmentId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return { ...tokens, user: profile };
  }

  async refresh(refreshToken: string, ctx: RequestContext = {}) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }
    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Invalid token.');
    }

    const tokenHash = AuthService.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    // Rotation: a refresh token can only ever be redeemed once.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(stored.userId, ctx);
    const profile = await this.me(stored.userId);
    return { ...tokens, user: profile };
  }

  async logout(userId: string, refreshToken?: string): Promise<{ success: boolean }> {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: AuthService.hashToken(refreshToken), userId },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: USER_PROFILE_SELECT,
    });
    if (!user) throw new UnauthorizedException('Account not found.');
    const permissions = await this.accessControl.getEffectivePermissions(userId);
    return { ...user, permissions };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, ctx: RequestContext = {}) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new UnauthorizedException('Account not found.');

    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) throw new BadRequestException('Your current password is incorrect.');
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('The new password must be different from the current one.');
    }

    const rounds = this.config.get<number>('bcryptRounds') ?? 12;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, rounds),
        mustChangePassword: false,
      },
    });

    // Force every other session to re-authenticate.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.record({
      actorId: userId,
      action: 'auth.password_changed',
      resourceType: 'User',
      resourceId: userId,
      summary: 'Password changed',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { success: true };
  }

  private async issueTokens(userId: string, ctx: RequestContext) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, role: { select: { key: true } } },
    });

    const basePayload: JwtPayload = { sub: user.id, email: user.email, role: user.role.key };

    const accessToken = await this.jwt.signAsync(
      { ...basePayload, tokenType: 'access' },
      {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: this.config.get<string>('jwt.expiresIn'),
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { ...basePayload, tokenType: 'refresh', jti: randomBytes(16).toString('hex') },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshExpiresIn'),
      },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp?: number } | null;
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: AuthService.hashToken(refreshToken),
        expiresAt,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });

    this.logger.debug(`Issued token pair for ${user.email}`);
    return { accessToken, refreshToken, tokenType: 'Bearer' as const };
  }

  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
