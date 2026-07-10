import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';
import { RateLimit } from './rate-limit/decorators/rate-limit.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @RateLimit({ requests: 5, window: 60 })
  @Get('test-rate-limit-override')
  getTestOverride() {
    return { status: 'ok', message: 'Override endpoint reached' };
  }
}
