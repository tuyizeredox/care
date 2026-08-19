import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssigneeMode, StageType, TaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class WorkflowStageDto {
  @ApiPropertyOptional({ description: 'Existing stage id when updating' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'GESI review' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ description: '1-based position in the chain', minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(50)
  order!: number;

  @ApiPropertyOptional({ enum: StageType, default: StageType.WORK })
  @IsOptional()
  @IsEnum(StageType)
  type?: StageType;

  @ApiPropertyOptional({ enum: AssigneeMode, default: AssigneeMode.UNASSIGNED })
  @IsOptional()
  @IsEnum(AssigneeMode)
  assigneeMode?: AssigneeMode;

  @ApiPropertyOptional({ description: 'Required when assigneeMode = SPECIFIC_USER' })
  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @ApiPropertyOptional({ description: 'Required when assigneeMode = POSITION' })
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional({ description: 'Required when assigneeMode = ROLE' })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({ enum: TaskStatus, default: TaskStatus.ASSIGNED })
  @IsOptional()
  @IsEnum(TaskStatus)
  entryStatus?: TaskStatus;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({ description: 'Target turnaround for this stage, in hours' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  slaHours?: number;

  @ApiPropertyOptional({ default: false, description: 'Completing this stage completes the task' })
  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;
}

export class WorkflowTransitionDto {
  @ApiProperty({ description: 'Order number of the source stage' })
  @IsInt()
  @Min(1)
  fromOrder!: number;

  @ApiProperty({ description: 'Order number of the target stage' })
  @IsInt()
  @Min(1)
  toOrder!: number;

  @ApiPropertyOptional({ example: 'Send for review' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @ApiPropertyOptional({ description: 'Permission key required to take this transition' })
  @IsOptional()
  @IsString()
  requiresPermission?: string;
}

export class CreateWorkflowDto {
  @ApiProperty({ example: 'Procurement request' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'PROCUREMENT' })
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,29}$/, {
    message: 'Code must be 2-30 characters using A-Z, 0-9, hyphen or underscore.',
  })
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taskTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ type: [WorkflowStageDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'A workflow needs at least one stage.' })
  @ValidateNested({ each: true })
  @Type(() => WorkflowStageDto)
  stages!: WorkflowStageDto[];

  @ApiPropertyOptional({ type: [WorkflowTransitionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowTransitionDto)
  transitions?: WorkflowTransitionDto[];
}
