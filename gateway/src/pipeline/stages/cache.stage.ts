import { Injectable, Logger } from '@nestjs/common';
import { RequestStage, NextFunction } from '../interfaces/request-stage.interface';
import { RequestContext } from '../interfaces/request-context.interface';
import { ProxyResponse } from '../interfaces/proxy-response.interface';
import { CacheService, CacheEntry } from '../../cache/cache.service';
import * as crypto from 'crypto';

@Injectable()
export class CacheStage implements RequestStage {
  private readonly logger = new Logger(CacheStage.name);

  constructor(private readonly cacheService: CacheService) {}

  async execute(context: RequestContext, next: NextFunction): Promise<ProxyResponse> {
    const { req, service } = context;

    // 1. Check if caching is enabled for this service
    if (!service || !service.cacheEnabled || req.method !== 'GET') {
      return this.executeAndCache(context, next, false);
    }

    // 2. Check Cache-Control headers
    const cacheControl = req.headers['cache-control'] || '';
    if (typeof cacheControl === 'string' && cacheControl.toLowerCase().includes('no-store')) {
      return this.executeAndCache(context, next, false);
    }

    // 3. Build Cache Key
    const key = this.buildCacheKey(req);

    // 4. Lookup
    const entry = await this.cacheService.get(key);

    if (entry) {
      // 5. ETag Check
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && entry.etag && ifNoneMatch === entry.etag) {
        return {
          status: 304,
          headers: { ...entry.headers, etag: entry.etag },
          data: '',
          targetUrl: context.targetUrl || 'cache',
        };
      }

      // 6. Stale-While-Revalidate
      if (Date.now() > entry.staleAt) {
        this.logger.debug(`Cache entry stale for ${key}, serving stale and refreshing in background`);
        // Trigger background refresh
        this.executeAndCache(context, next, true, key, service.defaultTtl)
          .catch(e => this.logger.error(`Background refresh failed for ${key}`, e));
      } else {
        this.logger.debug(`Cache hit for ${key}`);
      }

      let parsedBody = entry.body;
      if (parsedBody && parsedBody.type === 'Buffer' && parsedBody.data) {
        parsedBody = Buffer.from(parsedBody.data, 'base64');
      }

      return {
        status: entry.status,
        headers: { ...entry.headers, etag: entry.etag, 'x-cache': 'HIT' },
        data: parsedBody,
        targetUrl: context.targetUrl || 'cache',
      };
    }

    this.logger.debug(`Cache miss for ${key}`);
    return this.executeAndCache(context, next, true, key, service.defaultTtl);
  }

  private async executeAndCache(
    context: RequestContext, 
    next: NextFunction, 
    shouldCache: boolean, 
    key?: string, 
    defaultTtl: number = 60
  ): Promise<ProxyResponse> {
    const response = await next();

    // Only cache successful GET responses
    if (shouldCache && key && response.status === 200) {
      let bodyToStore = response.data;
      
      // If data is a Buffer, convert it to base64 for JSON serialization
      let bodyStrForEtag = '';
      if (Buffer.isBuffer(response.data)) {
        bodyToStore = { type: 'Buffer', data: response.data.toString('base64') };
        bodyStrForEtag = response.data.toString('base64');
      } else {
        bodyStrForEtag = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      }

      const etag = `"${crypto.createHash('md5').update(bodyStrForEtag).digest('hex')}"`;

      let ttl = defaultTtl;
      const resCacheControl = Object.keys(response.headers).find(k => k.toLowerCase() === 'cache-control');
      if (resCacheControl) {
        const headerVal = response.headers[resCacheControl];
        const strVal = Array.isArray(headerVal) ? headerVal[0] : headerVal;
        const match = /max-age=(\d+)/.exec(strVal || '');
        if (match) {
          ttl = parseInt(match[1], 10);
        }
        if ((strVal || '').toLowerCase().includes('no-store') || (strVal || '').toLowerCase().includes('private')) {
          return response; // Do not cache
        }
      }

      const staleAt = Date.now() + (ttl * 1000) / 2;
      const expiresAt = Date.now() + (ttl * 1000);

      const entry: CacheEntry = {
        status: response.status,
        headers: response.headers,
        body: bodyToStore,
        staleAt,
        expiresAt,
        etag,
      };

      const pathParts = (context.req.url || '/').split('/').filter(Boolean);
      const tags = pathParts.length > 0 ? [pathParts[0]] : [];

      this.cacheService.set(key, entry, tags).catch(e => {
        this.logger.error(`Failed to write cache for ${key}`, e);
      });

      response.headers = { ...response.headers, etag, 'x-cache': 'MISS' };
    }

    return response;
  }

  private buildCacheKey(req: any): string {
    const url = req.url || req.originalUrl || '/';
    const method = req.method;
    const accept = req.headers['accept'] || '*/*';
    const acceptLang = req.headers['accept-language'] || '*';
    return `${method}:${url}:${accept}:${acceptLang}`;
  }
}
