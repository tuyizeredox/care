import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'FIELD_COORDINATOR' })
  @IsString()
  @MaxLength(40)
  key!: string;

  @ApiProperty() @IsString() @MaxLength(80) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) description?: string;
  @ApiPropertyOptional({ description: 'Seniority: higher is more senior' })
  @IsOptional()
  @IsInt()
  @Min(0)
  level?: number;

  @ApiPropertyOptional({ type: [String], description: 'Permission keys granted to the role' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissionKeys?: string[];
}

/** The key is referenced from code and never changes after creation. */
export class UpdateRoleDto extends PartialType(OmitType(CreateRoleDto, ['key'] as const)) {}
