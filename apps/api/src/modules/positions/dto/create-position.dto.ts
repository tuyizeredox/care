import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreatePositionDto {
  @ApiProperty() @IsString() @MaxLength(160) title!: string;
  @ApiProperty({ description: 'Unique code, e.g. SERVE_PM' })
  @IsString()
  @MaxLength(40)
  code!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() departmentId?: string;
  @ApiPropertyOptional({ description: 'Position this role reports to' })
  @IsOptional()
  @IsString()
  reportsToId?: string;

  @ApiPropertyOptional({ description: '100 = Country Director, 80 = Director, 60 = Manager' })
  @IsOptional()
  @IsInt()
  @Min(0)
  level?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) headcount?: number;
}
