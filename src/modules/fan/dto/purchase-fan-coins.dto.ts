import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class PurchaseFanCoinsDto {
  @ApiProperty({ example: 'starter', description: 'Server-configured coin package ID' })
  @IsString()
  @IsNotEmpty()
  packageId: string;
}
