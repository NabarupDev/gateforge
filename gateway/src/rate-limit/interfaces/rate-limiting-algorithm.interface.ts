import { RateLimitPolicy, RateLimitResult } from './rate-limit-policy.interface';

export const RATE_LIMITING_ALGORITHM = Symbol('RATE_LIMITING_ALGORITHM');

export interface RateLimitingAlgorithm {
  /**
   * Consumes one request quota against the given key and policy.
   * Must execute atomically across multiple distributed instances.
   *
   * @param key The unique identifier for the entity (e.g. `rl:user:123` or `rl:ip:1.2.3.4`)
   * @param policy The applicable policy rule (`requests` per `window` seconds)
   */
  consume(key: string, policy: RateLimitPolicy): Promise<RateLimitResult>;
}
