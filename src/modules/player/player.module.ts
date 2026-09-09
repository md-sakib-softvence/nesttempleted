import { Module } from '@nestjs/common';
import { PlayerService } from './service/player.service';
import { PlayerController } from './controller/player.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlayerController],
  providers: [PlayerService],
  exports: [PlayerService],
})
export class PlayerModule {}
