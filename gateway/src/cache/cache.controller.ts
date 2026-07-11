import { Controller, Get, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { CacheService } from './cache.service';
// import { AuthGuard } from '../auth/auth.guard'; // Might want to secure this endpoint

export class InvalidateDto {
  tags!: string[];
}

@Controller('gateway/cache')
export class CacheController {
  constructor(private readonly cacheService: CacheService) {}

  @Get()
  async getMetrics() {
    return this.cacheService.getMetrics();
  }

  @Post('invalidate')
  @HttpCode(HttpStatus.OK)
  async invalidate(@Body() dto: InvalidateDto) {
    if (!dto.tags || !Array.isArray(dto.tags)) {
      return { success: false, error: 'tags must be an array of strings' };
    }
    const count = await this.cacheService.invalidateByTags(dto.tags);
    return { success: true, invalidatedKeys: count };
  }
}
