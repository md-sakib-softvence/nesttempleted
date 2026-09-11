import { PartialType } from '@nestjs/swagger';
import { CreateMarketingDataDto } from './create-marketing-data.dto';

export class UpdateMarketingDataDto extends PartialType(
  CreateMarketingDataDto,
) {}
