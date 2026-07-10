import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RATE_LIMITING_ALGORITHM } from './interfaces/rate-limiting-algorithm.interface';
import type { RateLimitingAlgorithm } from './interfaces/rate-limiting-algorithm.interface';
import { RateLimitPolicyService } from './rate-limit-policy.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    @Inject(RATE_LIMITING_ALGORITHM)
    private readonly algorithm: RateLimitingAlgorithm,
    private readonly policyService: RateLimitPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const { key, policy, principalName } = this.policyService.resolvePolicy(context);
    const result = await this.algorithm.consume(key, policy);

    // Helper to safely set response headers across Express and Fastify/raw responses
    const setHeader = (headerName: string, value: string) => {
      if (response && typeof response.header === 'function') {
        response.header(headerName, value);
      } else if (response && typeof response.setHeader === 'function') {
        response.setHeader(headerName, value);
      } else if (response && response.raw && typeof response.raw.setHeader === 'function') {
        response.raw.setHeader(headerName, value);
      }
    };

    if (policy.unlimited) {
      setHeader('X-RateLimit-Limit', 'Unlimited');
      setHeader('X-RateLimit-Remaining', 'Unlimited');
      setHeader('X-RateLimit-Reset', String(result.reset));
    } else {
      setHeader('X-RateLimit-Limit', String(result.limit));
      setHeader('X-RateLimit-Remaining', String(result.remaining));
      setHeader('X-RateLimit-Reset', String(result.reset));
    }

    if (!result.allowed) {
      const retryAfterSec = result.retryAfter ?? 1;
      setHeader('Retry-After', String(retryAfterSec));

      const requestId =
        request.requestId ||
        request.headers?.['x-request-id'] ||
        (request.raw && request.raw.requestId) ||
        'unknown';

      // Observability: Log structured rejection for analytics dashboard
      this.logger.warn(
        JSON.stringify({
          event: 'RATE_LIMIT_REJECTED',
          requestId,
          principal: principalName,
          policy: policy.name || 'custom',
          remaining: 0,
          retryAfter: retryAfterSec,
          status: 429,
          timestamp: new Date().toISOString(),
        }),
      );

      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
