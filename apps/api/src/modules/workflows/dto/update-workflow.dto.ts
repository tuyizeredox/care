import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateWorkflowDto } from './create-workflow.dto';

/**
 * Workflow code is immutable. Supplying `stages` replaces the whole chain;
 * omitting it leaves the existing stages untouched.
 */
export class UpdateWorkflowDto extends PartialType(
  OmitType(CreateWorkflowDto, ['code'] as const),
) {}
