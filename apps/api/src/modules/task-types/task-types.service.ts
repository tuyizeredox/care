import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

export class CreateTaskTypeDto {
  @ApiProperty({ example: 'Programme report' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ example: 'PROGRAMME_REPORT' })
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,29}$/, {
    message: 'Code must be 2-30 characters using A-Z, 0-9, hyphen or underscore.',
  })
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Lucide icon name rendered in the UI' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;
}

export class UpdateTaskTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;
}

@Injectable()
export class TaskTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.taskType.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { tasks: { where: { deletedAt: null } }, workflows: true } },
      },
    });
  }

  async findOne(id: string) {
    const taskType = await this.prisma.taskType.findFirst({ where: { id, deletedAt: null } });
    if (!taskType) throw new NotFoundException('This task type could not be found.');
    return taskType;
  }

  async create(user: AuthenticatedUser, dto: CreateTaskTypeDto) {
    const created = await this.prisma.taskType.create({
      data: {
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description ?? null,
        icon: dto.icon ?? null,
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'task_type.created',
      resourceType: 'TaskType',
      resourceId: created.id,
      summary: 'Created task type ' + created.name,
    });
    return created;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateTaskTypeDto) {
    await this.findOne(id);
    const updated = await this.prisma.taskType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'task_type.updated',
      resourceType: 'TaskType',
      resourceId: id,
      summary: 'Updated task type ' + updated.name,
    });
    return updated;
  }

  async remove(user: AuthenticatedUser, id: string) {
    const taskType = await this.findOne(id);
    await this.prisma.taskType.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      actorId: user.id,
      action: 'task_type.archived',
      resourceType: 'TaskType',
      resourceId: id,
      summary: 'Archived task type ' + taskType.name,
    });
    return { success: true };
  }
}
