import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateCommentDto {
  @ApiProperty({ example: '@GESI Advisor please update section 4.' })
  @IsString()
  @MinLength(1, { message: 'A comment cannot be empty.' })
  @MaxLength(10000)
  body!: string;

  @ApiPropertyOptional({ description: 'Comment being replied to' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'User ids mentioned in the body. Mentioned users are notified.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionIds?: string[];
}

export class UpdateCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
}

export class CommentQueryDto extends PaginationQueryDto {}
