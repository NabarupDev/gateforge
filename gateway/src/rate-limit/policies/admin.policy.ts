import { RateLimitPolicy } from '../interfaces/rate-limit-policy.interface';

export const ADMIN_POLICY: RateLimitPolicy = {
  name: 'admin',
  requests: Infinity,
  window: 60,
  unlimited: true,
};
