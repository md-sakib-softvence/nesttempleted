import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FollowDto {
  @ApiProperty({
    description: 'ID of the player or fan you want to follow',
    example: 'c6b840e4-18f4-4e92-9694-802c3ef32fbc',
  })
  @IsString()
  @IsNotEmpty()
  targetId: string;

  // Optional internal aliases without Swagger pollution
  @IsOptional()
  @IsString()
  playerId?: string;

  @IsOptional()
  @IsString()
  gamerTag?: string;
}

export class UnfollowDto {
  @ApiProperty({
    description: 'ID of the player or fan to unfollow',
    example: 'c6b840e4-18f4-4e92-9694-802c3ef32fbc',
  })
  @IsString()
  @IsNotEmpty()
  targetId: string;

  // Optional internal aliases without Swagger pollution
  @IsOptional()
  @IsString()
  playerId?: string;

  @IsOptional()
  @IsString()
  gamerTag?: string;
}
