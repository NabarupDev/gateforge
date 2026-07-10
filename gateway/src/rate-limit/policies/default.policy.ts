import { RateLimitPolicy } from '../interfaces/rate-limit-policy.interface';

export const DEFAULT_ANONYMOUS_POLICY: RateLimitPolicy = {
  name: 'anonymous',
  requests: 20,
  window: 60,
};
