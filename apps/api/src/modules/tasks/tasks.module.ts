import { Global, Module } from '@nestjs/common';
import { TaskAssignmentService } from './task-assignment.service';
import { TaskHistoryService } from './task-history.service';
import { TaskJourneyService } from './task-journey.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Global()
@Module({
  controllers: [TasksController],
  providers: [TasksService, TaskHistoryService, TaskAssignmentService, TaskJourneyService],
  exports: [TasksService, TaskHistoryService, TaskAssignmentService, TaskJourneyService],
})
export class TasksModule {}
