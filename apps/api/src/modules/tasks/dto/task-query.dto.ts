import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus, WaitingReason } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

/** Accepts `?status=A&status=B` and `?status=A,B` alike. */
const toArray = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const toBool = ({ value }: { value: unknown }): unknown =>
  value === undefined ? undefined : value === true || value === 'true';

export class TaskQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TaskStatus, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(TaskStatus, { each: true })
  status?: TaskStatus[];

  @ApiPropertyOptional({ enum: TaskPriority, isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsEnum(TaskPriority, { each: true })
  priority?: TaskPriority[];

  @ApiPropertyOptional({ isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  departmentId?: string[];

  @ApiPropertyOptional({ isArray: true })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  projectId?: string[];

  @ApiPropertyOptional({ isArray: true, description: 'Current owner' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  ownerId?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdById?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  waitingForUserId?: string;

  @ApiPropertyOptional({ enum: WaitingReason })
  @IsOptional()
  @IsEnum(WaitingReason)
  waitingReason?: WaitingReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workflowId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taskTypeId?: string;

  @ApiPropertyOptional({ isArray: true, description: 'Tag names' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Deadline on or after this date' })
  @IsOptional()
  @IsDateString()
  deadlineFrom?: string;

  @ApiPropertyOptional({ description: 'Deadline on or before this date' })
  @IsOptional()
  @IsDateString()
  deadlineTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ description: 'Past deadline and still open' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ description: 'Deadline is today' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  dueToday?: boolean;

  @ApiPropertyOptional({ description: 'Deadline within the next 7 days' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  dueSoon?: boolean;

  @ApiPropertyOptional({ description: 'Tasks I currently own' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  assignedToMe?: boolean;

  @ApiPropertyOptional({ description: 'Tasks I created that someone else holds' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  waitingOnOthers?: boolean;

  @ApiPropertyOptional({ description: 'Tasks awaiting my review or approval' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  needsMyAction?: boolean;

  @ApiPropertyOptional({ description: 'Tasks I previously handled' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  previouslyMine?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Include subtasks in the result' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeSubtasks?: boolean;

}
