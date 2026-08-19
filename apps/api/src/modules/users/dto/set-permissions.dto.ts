import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsString, ValidateNested } from 'class-validator';

export class PermissionOverrideDto {
  @ApiProperty() @IsString() permissionKey!: string;
  @ApiProperty({ description: 'true grants, false explicitly revokes' })
  @IsBoolean()
  granted!: boolean;
}

export class SetUserPermissionsDto {
  @ApiProperty({ type: [PermissionOverrideDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionOverrideDto)
  overrides!: PermissionOverrideDto[];
}
