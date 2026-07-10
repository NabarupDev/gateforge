import { RateLimitPolicy } from '../interfaces/rate-limit-policy.interface';

export const API_KEY_POLICY: RateLimitPolicy = {
  name: 'api-key',
  requests: 500,
  window: 60,
};
