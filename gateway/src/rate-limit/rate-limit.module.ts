import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import Redis from 'ioredis';
import { RATE_LIMITING_ALGORITHM } from './interfaces/rate-limiting-algorithm.interface';
import { SlidingWindowLogAlgorithm, REDIS_CLIENT } from './algorithms/sliding-window-log.algorithm';
import { RateLimitPolicyService } from './rate-limit-policy.service';
import { RateLimitGuard } from './rate-limit.guard';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('REDIS_URL') || process.env.REDIS_URL;
        if (url) {
          return new Redis(url, { maxRetriesPerRequest: 3 });
        }
        const host = configService.get<string>('REDIS_HOST') || process.env.REDIS_HOST || 'localhost';
        const port = Number(configService.get<number>('REDIS_PORT') || process.env.REDIS_PORT || 6379);
        const username = configService.get<string>('REDIS_USERNAME') || process.env.REDIS_USERNAME;
        const password = configService.get<string>('REDIS_PASSWORD') || process.env.REDIS_PASSWORD;
        return new Redis({
          host,
          port,
          username,
          password,
          maxRetriesPerRequest: 3,
        });
      },
    },
    SlidingWindowLogAlgorithm,
    {
      provide: RATE_LIMITING_ALGORITHM,
      useClass: SlidingWindowLogAlgorithm,
    },
    RateLimitPolicyService,
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    RateLimitGuard,
  ],
  exports: [
    REDIS_CLIENT,
    SlidingWindowLogAlgorithm,
    RATE_LIMITING_ALGORITHM,
    RateLimitPolicyService,
    RateLimitGuard,
  ],
})
export class RateLimitModule {}
