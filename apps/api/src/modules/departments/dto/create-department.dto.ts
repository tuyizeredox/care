import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty() @IsString() @MaxLength(120) name!: string;
  @ApiProperty({ description: 'Unique short code, e.g. PROG' })
  @IsString()
  @MaxLength(20)
  code!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional({ example: '#3B82F6' }) @IsOptional() @IsHexColor() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() headUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unitId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}
