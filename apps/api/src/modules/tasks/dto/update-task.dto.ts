import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

/**
 * Field edits only. Ownership and status are moved through the dedicated
 * assign / handover / submit / review endpoints so every move is auditable.
 */
export class UpdateTaskDto extends PartialType(
  OmitType(CreateTaskDto, ['assigneeId', 'parentTaskId', 'asDraft', 'workflowId'] as const),
) {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ description: 'Actual effort spent, in hours' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualHours?: number;

  @ApiPropertyOptional({ description: 'Reason recorded in the task history' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
