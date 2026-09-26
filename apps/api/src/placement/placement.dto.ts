import { createZodDto } from 'nestjs-zod';
import {
  PlacementQuestionSchema,
  PlacementResultSchema,
  StartPlacementSchema,
  SubmitAnswerSchema,
} from '@ft/shared';

export class StartPlacementDto extends createZodDto(StartPlacementSchema) {}
export class SubmitAnswerDto extends createZodDto(SubmitAnswerSchema) {}
export class PlacementQuestionDto extends createZodDto(PlacementQuestionSchema) {}
export class PlacementResultDto extends createZodDto(PlacementResultSchema) {}
