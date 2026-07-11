import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../rate-limit/algorithms/sliding-window-log.algorithm';

export interface CacheEntry {
  status: number;
  headers: Record<string, string | string[]>;
  body: any; // Stored as a JSON string or raw
  staleAt: number;
  expiresAt: number;
  etag?: string;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private getCacheKey(key: string) {
    return `gf:cache:response:${key}`;
  }

  private getTagKey(tag: string) {
    return `gf:cache:tag:${tag}`;
  }

  async get(key: string): Promise<CacheEntry | null> {
    const raw = await this.redis.get(this.getCacheKey(key));
    if (!raw) {
      await this.incrementMetric('misses');
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as CacheEntry;
      await this.incrementMetric('hits');
      
      const now = Date.now();
      if (now > parsed.staleAt && now <= parsed.expiresAt) {
        await this.incrementMetric('staleServed');
      }
      return parsed;
    } catch (e) {
      this.logger.error(`Failed to parse cache entry for key ${key}`, e);
      return null;
    }
  }

  async set(key: string, entry: CacheEntry, tags: string[] = []): Promise<void> {
    const raw = JSON.stringify(entry);
    // Use expiresAt for actual Redis TTL (calculate delta in seconds)
    const ttlSeconds = Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000));
    
    const pipeline = this.redis.pipeline();
    pipeline.setex(this.getCacheKey(key), ttlSeconds, raw);

    // Track tags
    for (const tag of tags) {
      pipeline.sadd(this.getTagKey(tag), key);
      // Give the tag set a TTL to prevent unbounded growth, e.g., max TTL of any item (say, 30 days)
      pipeline.expire(this.getTagKey(tag), 60 * 60 * 24 * 30);
    }

    await pipeline.exec();
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    let invalidatedCount = 0;
    for (const tag of tags) {
      const keys = await this.redis.smembers(this.getTagKey(tag));
      if (keys.length > 0) {
        const pipeline = this.redis.pipeline();
        keys.forEach(k => pipeline.del(this.getCacheKey(k)));
        pipeline.del(this.getTagKey(tag));
        await pipeline.exec();
        invalidatedCount += keys.length;
      }
    }
    return invalidatedCount;
  }

  async getMetrics() {
    const hits = parseInt(await this.redis.get('gf:cache:metrics:hits') || '0', 10);
    const misses = parseInt(await this.redis.get('gf:cache:metrics:misses') || '0', 10);
    const staleServed = parseInt(await this.redis.get('gf:cache:metrics:staleServed') || '0', 10);
    
    const total = hits + misses;
    const hitRate = total > 0 ? `${((hits / total) * 100).toFixed(2)}%` : '0%';

    return { hitRate, hits, misses, staleServed };
  }

  private async incrementMetric(metric: 'hits' | 'misses' | 'staleServed') {
    await this.redis.incr(`gf:cache:metrics:${metric}`);
  }
}
