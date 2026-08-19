import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

export class UpsertSettingDto {
  @ApiProperty({ description: 'Any JSON value' })
  value!: Prisma.InputJsonValue;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

/** Defaults applied on first boot; administrators can override any of them. */
export const DEFAULT_SETTINGS: Array<{
  key: string;
  value: Prisma.InputJsonValue;
  category: string;
  label: string;
  description: string;
}> = [
  {
    key: 'organization.name',
    value: 'CARE',
    category: 'general',
    label: 'Organisation name',
    description: 'Shown in the header, emails and report exports.',
  },
  {
    key: 'tasks.default_priority',
    value: 'MEDIUM',
    category: 'tasks',
    label: 'Default task priority',
    description: 'Priority pre-selected on the task creation form.',
  },
  {
    key: 'tasks.reminder_days_before',
    value: [3, 1],
    category: 'notifications',
    label: 'Deadline reminder days',
    description: 'How many days before a deadline reminders are sent.',
  },
  {
    key: 'tasks.notify_manager_on_overdue',
    value: true,
    category: 'notifications',
    label: 'Notify managers about overdue work',
    description: 'Line managers receive a daily summary of overdue team tasks.',
  },
  {
    key: 'workflow.allow_skip_stages',
    value: false,
    category: 'workflow',
    label: 'Allow stages to be skipped',
    description: 'When off, tasks must follow the configured stage order.',
  },
];

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(category?: string) {
    return this.prisma.setting.findMany({
      where: category ? { category } : {},
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
  }

  async get<T = unknown>(key: string, fallback?: T): Promise<T> {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) {
      if (fallback !== undefined) return fallback;
      throw new NotFoundException('This setting could not be found.');
    }
    return setting.value as T;
  }

  async upsert(user: AuthenticatedUser, key: string, dto: UpsertSettingDto) {
    const existing = await this.prisma.setting.findUnique({ where: { key } });
    const setting = await this.prisma.setting.upsert({
      where: { key },
      create: {
        key,
        value: dto.value,
        category: dto.category ?? 'general',
        label: dto.label ?? key,
        description: dto.description ?? null,
      },
      update: {
        value: dto.value,
        ...(dto.category ? { category: dto.category } : {}),
        ...(dto.label ? { label: dto.label } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'setting.updated',
      resourceType: 'Setting',
      resourceId: setting.id,
      summary: 'Updated setting ' + key,
      before: existing ? { value: existing.value as Prisma.InputJsonValue } : undefined,
      after: { value: dto.value },
    });
    return setting;
  }

  /** Idempotent: called at boot and by the seed script. */
  async ensureDefaults(): Promise<void> {
    for (const setting of DEFAULT_SETTINGS) {
      await this.prisma.setting.upsert({
        where: { key: setting.key },
        create: setting,
        update: {},
      });
    }
  }
}
