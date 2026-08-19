import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';

/** The project code is immutable once tasks reference it. */
export class UpdateProjectDto extends PartialType(OmitType(CreateProjectDto, ['code'] as const)) {}
