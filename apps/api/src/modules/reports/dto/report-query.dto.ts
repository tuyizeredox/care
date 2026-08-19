import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export const REPORT_TYPES = [
  'task-completion',
  'overdue',
  'department-performance',
  'employee-workload',
  'project-performance',
  'workflow-performance',
  'bottleneck',
  'approval',
  'task-aging',
  'monthly-activity',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

const toArray = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export class ReportQueryDto {
  @ApiProperty({ enum: REPORT_TYPES })
  @IsIn(REPORT_TYPES as unknown as string[])
  type!: ReportType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workflowId?: string;

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
}

export class ExportReportDto extends ReportQueryDto {
  @ApiProperty({ enum: ['csv', 'excel', 'pdf'] })
  @IsIn(['csv', 'excel', 'pdf'])
  format!: 'csv' | 'excel' | 'pdf';
}
