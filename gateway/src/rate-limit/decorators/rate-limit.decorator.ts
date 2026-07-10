import { SetMetadata } from '@nestjs/common';
import { RateLimitPolicy } from '../interfaces/rate-limit-policy.interface';

export const RATE_LIMIT_KEY = 'rate_limit';

export const RateLimit = (policy: Partial<RateLimitPolicy>) =>
  SetMetadata(RATE_LIMIT_KEY, policy);
