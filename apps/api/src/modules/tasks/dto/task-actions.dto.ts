import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus, WaitingReason } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AssignTaskDto {
  @ApiProperty({ description: 'Employee who takes ownership' })
  @IsString()
  @MinLength(1)
  assigneeId!: string;

  @ApiPropertyOptional({ description: 'Why this person, shown in the task journey' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ description: 'Move the task to this workflow stage' })
  @IsOptional()
  @IsString()
  stageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deadline?: string;
}

export class SubmitTaskDto {
  @ApiPropertyOptional({ description: 'What was done, shown to the reviewer' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ description: 'Reviewer to send the work to' })
  @IsOptional()
  @IsString()
  reviewerId?: string;
}

export class HandoverTaskDto {
  @ApiProperty({ description: 'Employee receiving the task' })
  @IsString()
  @MinLength(1)
  toUserId!: string;

  @ApiProperty({
    enum: ['CONTINUE', 'SUBMIT', 'REVIEW', 'APPROVE'],
    description: 'What the receiver is being asked to do',
  })
  @IsEnum(['CONTINUE', 'SUBMIT', 'REVIEW', 'APPROVE'])
  action!: 'CONTINUE' | 'SUBMIT' | 'REVIEW' | 'APPROVE';

  @ApiPropertyOptional({ example: 'Report prepared and ready for GESI review.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ description: 'Stage the task should enter' })
  @IsOptional()
  @IsString()
  stageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deadline?: string;
}

export class ReviewTaskDto {
  @ApiProperty({ enum: ['APPROVE', 'REQUEST_CHANGES', 'REJECT'] })
  @IsEnum(['APPROVE', 'REQUEST_CHANGES', 'REJECT'])
  decision!: 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';

  @ApiPropertyOptional({ description: 'Required when requesting changes or rejecting' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ description: 'Send the task back to this person instead of the submitter' })
  @IsOptional()
  @IsString()
  returnToUserId?: string;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: TaskStatus })
  @IsEnum(TaskStatus)
  status!: TaskStatus;

  @ApiPropertyOptional({ description: 'Required when blocking or cancelling' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class SetWaitingDto {
  @ApiProperty({ enum: WaitingReason })
  @IsEnum(WaitingReason)
  reason!: WaitingReason;

  @ApiPropertyOptional({ description: 'Person the task is waiting on' })
  @IsOptional()
  @IsString()
  waitingForUserId?: string;
}

export class ChangePriorityDto {
  @ApiProperty({ enum: TaskPriority })
  @IsEnum(TaskPriority)
  priority!: TaskPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ChangeDeadlineDto {
  @ApiPropertyOptional({ description: 'Omit to clear the deadline' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
