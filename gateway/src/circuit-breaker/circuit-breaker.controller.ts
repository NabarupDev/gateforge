import { Controller, Get, Inject } from '@nestjs/common';
import { RegistryService } from '../registry/registry.service';
import { Public } from '../auth/decorators/public.decorator';
import { RUNTIME_STATE_STORE } from '../runtime-state/interfaces/runtime-state-store.interface';
import type { RuntimeStateStore } from '../runtime-state/interfaces/runtime-state-store.interface';

@Controller('gateway/circuits')
export class CircuitBreakerController {
  constructor(
    private readonly registryService: RegistryService,
    @Inject(RUNTIME_STATE_STORE) private readonly stateStore: RuntimeStateStore,
  ) {}

  @Public()
  @Get()
  async getDashboard() {
    const services = await this.registryService.getServices();
    
    const dashboard: Record<string, Record<string, string>> = {};

    for (const service of services) {
      if (!service.instances) continue;
      
      dashboard[service.name] = {};

      await Promise.all(
        service.instances.map(async (instance) => {
          const cb = await this.stateStore.getCircuit(instance.id);
          const state = cb ? cb.state : 'CLOSED';
          dashboard[service.name][instance.port.toString()] = state;
        })
      );
    }

    return dashboard;
  }
}
