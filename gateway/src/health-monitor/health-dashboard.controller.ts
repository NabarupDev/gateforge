import { Controller, Get, Inject } from '@nestjs/common';
import { RegistryService } from '../registry/registry.service';
import { HealthStatus } from '@gateforge/shared';
import { Public } from '../auth/decorators/public.decorator';
import { RUNTIME_STATE_STORE } from '../runtime-state/interfaces/runtime-state-store.interface';
import type { RuntimeStateStore } from '../runtime-state/interfaces/runtime-state-store.interface';

@Controller('gateway/health/services')
export class HealthDashboardController {
  constructor(
    private readonly registryService: RegistryService,
    @Inject(RUNTIME_STATE_STORE) private readonly stateStore: RuntimeStateStore,
  ) {}

  @Public()
  @Get()
  async getDashboard() {
    const services = await this.registryService.getServices();
    
    const dashboard: Record<string, any[]> = {};

    for (const service of services) {
      if (!service.instances) {
        dashboard[service.name] = [];
        continue;
      }

      dashboard[service.name] = await Promise.all(
        service.instances.map(async (instance) => {
          const state = await this.stateStore.getHealth(instance.id);
          const status = state ? state.status : HealthStatus.HEALTHY;
          const latency = state && state.latency ? Math.round(state.latency) : null;

          return {
            host: instance.host,
            port: instance.port,
            status,
            latency,
          };
        })
      );
    }

    return dashboard;
  }
}
