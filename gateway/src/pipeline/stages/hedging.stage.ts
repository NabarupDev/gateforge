import { Injectable, Logger } from '@nestjs/common';
import { RequestStage, NextFunction } from '../interfaces/request-stage.interface';
import { RequestContext } from '../interfaces/request-context.interface';
import { ProxyResponse } from '../interfaces/proxy-response.interface';

@Injectable()
export class HedgingStage implements RequestStage {
  private readonly logger = new Logger(HedgingStage.name);

  async execute(context: RequestContext, next: NextFunction): Promise<ProxyResponse> {
    const hedgingThresholdMs = context.service?.hedgingThresholdMs;
    
    const requireIdempotency = context.service?.idempotentRetries ?? true;
    const method = (context.req.method || 'GET').toUpperCase();
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    const hasIdempotencyKey = !!context.req.headers['idempotency-key'];
    const isRetryableMethod = safeMethods.includes(method) || (!requireIdempotency) || hasIdempotencyKey;

    if (!hedgingThresholdMs || !isRetryableMethod) {
      return next();
    }

    const ac1 = new AbortController();
    const ctx1: RequestContext = { ...context, abortSignal: ac1.signal };
    
    const t0 = performance.now();
    // Launch first request
    const req1Promise = next(ctx1);

    // Wait for the threshold
    const thresholdPromise = new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), hedgingThresholdMs));
    
    const firstRace = await Promise.race([req1Promise, thresholdPromise]);

    if (firstRace !== 'timeout') {
      this.logger.log(`[Hedge] firstRace won at ${performance.now() - t0}ms`);
      return firstRace as ProxyResponse;
    }

    this.logger.log(`[Hedge] Hedging request after ${performance.now() - t0}ms delay for service ${context.service?.name}`);
    
    const ac2 = new AbortController();
    const ctx2: RequestContext = { ...context, abortSignal: ac2.signal };
    
    // Launch hedged request
    const tHedge = performance.now();
    const req2Promise = next(ctx2);

    try {
      const finalWinner = await Promise.any([
        req1Promise.then(res => {
           this.logger.log(`[Hedge] req1 finished at ${performance.now() - t0}ms`);
           ac2.abort('req1 finished first');
           return res;
        }),
        req2Promise.then(res => {
           this.logger.log(`[Hedge] req2 finished at ${performance.now() - t0}ms (hedge duration: ${performance.now() - tHedge}ms)`);
           ac1.abort('req2 finished first');
           return res;
        })
      ]);
      this.logger.log(`[Hedge] Promise.any resolved at ${performance.now() - t0}ms`);
      return finalWinner;
    } catch (aggregateErr: any) {
      // If both requests throw an actual exception
      throw aggregateErr.errors[0];
    }
  }
}
