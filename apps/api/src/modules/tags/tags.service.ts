import { Injectable, NotFoundException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateTagDto {
  @ApiProperty({ example: 'quarterly-report' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @ApiPropertyOptional({ example: '#64748B' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class UpdateTagDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  color?: string;
}

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(search?: string) {
    return this.prisma.tag.findMany({
      where: {
        deletedAt: null,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      include: { _count: { select: { tasks: true } } },
      take: 200,
    });
  }

  create(dto: CreateTagDto) {
    const name = dto.name.trim().toLowerCase();
    return this.prisma.tag.upsert({
      where: { name },
      create: { name, color: dto.color ?? '#64748B' },
      update: { deletedAt: null, ...(dto.color ? { color: dto.color } : {}) },
    });
  }

  async update(id: string, dto: UpdateTagDto) {
    const tag = await this.prisma.tag.findFirst({ where: { id, deletedAt: null } });
    if (!tag) throw new NotFoundException('This tag could not be found.');
    return this.prisma.tag.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim().toLowerCase() } : {}),
        ...(dto.color ? { color: dto.color } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.prisma.tag.update({ where: { id }, data: { deletedAt: new Date() } });
    return { success: true };
  }

  /**
   * Resolves free-text tag names to ids, creating any that do not exist yet.
   * Used by task create/update so the client never has to pre-create tags.
   */
  async resolveNames(names: string[]): Promise<string[]> {
    const cleaned = [...new Set(names.map((name) => name.trim().toLowerCase()).filter(Boolean))];
    if (cleaned.length === 0) return [];

    await this.prisma.$transaction(
      cleaned.map((name) =>
        this.prisma.tag.upsert({ where: { name }, create: { name }, update: { deletedAt: null } }),
      ),
    );
    const tags = await this.prisma.tag.findMany({
      where: { name: { in: cleaned } },
      select: { id: true },
    });
    return tags.map((tag) => tag.id);
  }
}
