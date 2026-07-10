import { RateLimitPolicy } from '../interfaces/rate-limit-policy.interface';

export const JWT_USER_POLICY: RateLimitPolicy = {
  name: 'jwt',
  requests: 100,
  window: 60,
};
