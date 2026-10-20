import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { SeriesService } from '../service/series.service';
import { sendResponse } from '../../utils/response.util';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Public Series Portal')
@Controller('public/series')
@Public()
export class PublicSeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Get(':slug')
  @ApiOperation({
    summary:
      'Public endpoint for public viewers, iframe widgets, and mobile apps. Returns only elements enabled in publication settings. No auth required.',
  })
  @ApiParam({ name: 'slug', description: 'Public Series URL Slug' })
  @ApiResponse({ status: 200, description: 'Public series data retrieved successfully' })
  async getPublicSeries(@Param('slug') slug: string) {
    const data = await this.seriesService.getPublicSeriesBySlug(slug);
    return sendResponse({
      message: 'Public series details retrieved successfully',
      data,
    });
  }
}
