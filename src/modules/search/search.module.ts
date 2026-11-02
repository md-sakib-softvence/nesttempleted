import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GlobalSearchController } from './search.controller';
import { GlobalSearchService } from './search.service';

@Module({
  imports: [PrismaModule],
  controllers: [GlobalSearchController],
  providers: [GlobalSearchService],
})
export class SearchModule {}
