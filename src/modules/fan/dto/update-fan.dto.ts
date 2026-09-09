import { PartialType } from '@nestjs/swagger';
import { CreateFanDto } from './create-fan.dto';

export class UpdateFanDto extends PartialType(CreateFanDto) {}
