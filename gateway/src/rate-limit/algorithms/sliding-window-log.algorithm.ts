import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { RateLimitPolicy, RateLimitResult } from '../interfaces/rate-limit-policy.interface';
import { RateLimitingAlgorithm } from '../interfaces/rate-limiting-algorithm.interface';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class SlidingWindowLogAlgorithm implements RateLimitingAlgorithm, OnModuleDestroy {
  private readonly redis: Redis;

  private readonly luaScript = `
    local key = KEYS[1]
    local nowMs = tonumber(ARGV[1])
    local windowStartMs = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local windowSec = tonumber(ARGV[4])
    local member = ARGV[5]

    -- 1. Purge entries older than the window start timestamp
    redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStartMs)

    -- 2. Count active entries in current window
    local currentCount = redis.call('ZCARD', key)

    if currentCount < limit then
      -- 3. Add current request timestamp to sorted set
      redis.call('ZADD', key, nowMs, member)
      -- 4. Set key expiration to ensure cleanup of inactive keys
      redis.call('EXPIRE', key, windowSec + 1)

      -- 5. Retrieve oldest entry timestamp for precise window reset calculation
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local oldestMs = nowMs
      if #oldest >= 2 then
        oldestMs = tonumber(oldest[2])
      end

      return { 1, limit - currentCount - 1, oldestMs }
    else
      -- Exceeded rate limit
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local oldestMs = nowMs
      if #oldest >= 2 then
        oldestMs = tonumber(oldest[2])
      end

      return { 0, 0, oldestMs }
    end
  `;

  constructor(
    @Inject(REDIS_CLIENT) redisClient: Redis,
  ) {
    this.redis = redisClient;
  }

  async consume(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
    const nowMs = Date.now();
    const nowSec = Math.floor(nowMs / 1000);

    if (policy.unlimited || policy.requests === Infinity || policy.requests < 0) {
      return {
        allowed: true,
        limit: policy.requests,
        remaining: policy.requests,
        reset: nowSec + policy.window,
      };
    }

    const windowStartMs = nowMs - policy.window * 1000;
    const uniqueMember = `${nowMs}-${randomUUID()}`;

    try {
      const res = (await this.redis.eval(
        this.luaScript,
        1,
        key,
        nowMs.toString(),
        windowStartMs.toString(),
        policy.requests.toString(),
        policy.window.toString(),
        uniqueMember,
      )) as [number, number, number];

      const allowed = res[0] === 1;
      const remaining = Math.max(0, Number(res[1]));
      const oldestMs = Number(res[2]);
      const reset = Math.ceil(oldestMs / 1000) + policy.window;
      const retryAfter = allowed ? undefined : Math.max(1, reset - nowSec);

      return {
        allowed,
        limit: policy.requests,
        remaining,
        reset,
        retryAfter,
      };
    } catch (error) {
      // If Redis connection fails temporarily or errors out, fall back safely or rethrow depending on strictness
      // Here we surface the error so that monitoring catches Redis unavailability
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.redis && typeof this.redis.quit === 'function') {
      await this.redis.quit().catch(() => {});
    }
  }
}
