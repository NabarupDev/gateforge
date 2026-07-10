import { Controller, Get, Inject } from '@nestjs/common';
import { RUNTIME_STATE_STORE } from '../runtime-state/interfaces/runtime-state-store.interface';
import type { RuntimeStateStore } from '../runtime-state/interfaces/runtime-state-store.interface';
import { RegistryService } from '../registry/registry.service';

@Controller('gateway/retries')
export class RetryController {
  constructor(
    @Inject(RUNTIME_STATE_STORE)
    private readonly stateStore: RuntimeStateStore,
    private readonly registryService: RegistryService,
  ) {}

  @Get()
  async getRetryMetrics() {
    const services = await this.registryService.getServices();
    const metrics: Record<string, any> = {};

    for (const service of services) {
      if (!service.enabled) continue;
      
      const serviceMetrics = await this.stateStore.getServiceMetrics(service.id);
      
      // Calculate budget used
      // Budget is 20% of requests. So budget = requests * 0.2
      // Used = retries / budget * 100
      let budgetUsed = '0%';
      if (serviceMetrics.requests >= 10) {
        const allowedRetries = serviceMetrics.requests * 0.2;
        if (allowedRetries > 0) {
          const usedPct = Math.min(100, Math.round((serviceMetrics.retries / allowedRetries) * 100));
          budgetUsed = `${usedPct}%`;
        }
      } else if (serviceMetrics.retries > 0) {
        // Less than 10 requests, budget is not enforced but we can still show a value
        budgetUsed = '<min threshold>';
      }

      metrics[service.name] = {
        requests: serviceMetrics.requests,
        retries: serviceMetrics.retries,
        timeouts: serviceMetrics.timeouts,
        successAfterRetry: serviceMetrics.successAfterRetry,
        retryBudgetUsed: budgetUsed,
      };
    }

    return metrics;
  }
}
