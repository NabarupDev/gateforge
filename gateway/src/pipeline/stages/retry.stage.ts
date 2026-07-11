import { Injectable, Inject, Logger } from '@nestjs/common';
import { RequestStage, NextFunction } from '../interfaces/request-stage.interface';
import { RequestContext } from '../interfaces/request-context.interface';
import { ProxyResponse } from '../interfaces/proxy-response.interface';
import { RUNTIME_STATE_STORE } from '../../runtime-state/interfaces/runtime-state-store.interface';
import type { RuntimeStateStore } from '../../runtime-state/interfaces/runtime-state-store.interface';
import { Counter } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { GATEFORGE_RETRY_TOTAL } from '../../telemetry/telemetry.module';

@Injectable()
export class RetryStage implements RequestStage {
  private readonly logger = new Logger(RetryStage.name);

  constructor(
    @Inject(RUNTIME_STATE_STORE)
    private readonly stateStore: RuntimeStateStore,
    @InjectMetric(GATEFORGE_RETRY_TOTAL) private readonly retriesTotal: Counter<string>
  ) {}

  async execute(context: RequestContext, next: NextFunction): Promise<ProxyResponse> {
    const service = context.service;
    const maxRetries = service?.maxRetries ?? 0;
    const baseBackoff = service?.retryBackoffMs ?? 200;
    const requireIdempotency = service?.idempotentRetries ?? true;
    
    // Increment global requests for budget tracking
    if (service) {
      await this.stateStore.incrementServiceMetric(service.id, 'requests').catch(e => this.logger.error('Failed to update metrics', e));
    }

    const method = (context.req.method || 'GET').toUpperCase();
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    const hasIdempotencyKey = !!context.req.headers['idempotency-key'];
    
    // If it's an unsafe method and idempotency is required, we can only retry if key is present
    const isRetryableMethod = safeMethods.includes(method) || (!requireIdempotency) || hasIdempotencyKey;

    let attempt = 0;
    
    while (true) {
      context.attempt = attempt;

      try {
        const response = await next();
        
        // 502, 503, 504 are retryable server errors
        const isRetryableStatus = [502, 503, 504].includes(response.status);
        
        if (isRetryableStatus && attempt < maxRetries && isRetryableMethod) {
          const budgetAllows = await this.checkRetryBudget(service?.id);
          if (budgetAllows) {
            attempt++;
            await this.delay(baseBackoff, attempt);
            if (service) await this.stateStore.incrementServiceMetric(service.id, 'retries').catch(() => {});
            this.retriesTotal.labels(service?.name || 'unknown').inc();
            this.logger.warn(`Retrying request due to ${response.status} (Attempt ${attempt}/${maxRetries})`);
            continue;
          } else {
            this.logger.warn(`Retry budget exhausted for service ${service?.id}`);
          }
        }
        
        if (attempt > 0 && !isRetryableStatus && response.status < 500 && service) {
           await this.stateStore.incrementServiceMetric(service.id, 'successAfterRetry').catch(() => {});
        }

        return response;
      } catch (error: any) {
        // Network errors or timeout exceptions thrown by HttpClient or TimeoutStage
        const isNetworkError = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'TimeoutError'].includes(error.code || error.name);
        
        if (isNetworkError && attempt < maxRetries && isRetryableMethod) {
          const budgetAllows = await this.checkRetryBudget(service?.id);
          if (budgetAllows) {
            attempt++;
            if (service && (error.code === 'ETIMEDOUT' || error.name === 'TimeoutError')) {
              await this.stateStore.incrementServiceMetric(service.id, 'timeouts').catch(() => {});
            }
            await this.delay(baseBackoff, attempt);
            if (service) await this.stateStore.incrementServiceMetric(service.id, 'retries').catch(() => {});
            this.retriesTotal.labels(service?.name || 'unknown').inc();
            this.logger.warn(`Retrying request due to network error ${error.code || error.name} (Attempt ${attempt}/${maxRetries})`);
            continue;
          } else {
            this.logger.warn(`Retry budget exhausted for service ${service?.id}`);
          }
        }
        
        // Cannot retry or max attempts reached
        throw error;
      }
    }
  }

  private async checkRetryBudget(serviceId?: string): Promise<boolean> {
    if (!serviceId) return true; // Static routes have no budget constraint

    try {
      const metrics = await this.stateStore.getServiceMetrics(serviceId);
      // Min 10 requests to start enforcing budget
      if (metrics.requests < 10) return true;
      
      const retryRate = metrics.retries / metrics.requests;
      return retryRate < 0.2; // 20% budget
    } catch (e) {
      this.logger.error('Failed to check retry budget, denying retry to be safe', e);
      return false;
    }
  }

  private delay(baseMs: number, attempt: number): Promise<void> {
    const ms = baseMs * Math.pow(2, attempt - 1);
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
