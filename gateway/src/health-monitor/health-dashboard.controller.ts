import { Controller, Get } from '@nestjs/common';
import { RegistryService } from '../registry/registry.service';
import { HealthStatus } from '@gateforge/shared';
import { Public } from '../auth/decorators/public.decorator';

@Controller('gateway/health/services')
export class HealthDashboardController {
  constructor(private readonly registryService: RegistryService) {}

  @Public()
  @Get()
  async getDashboard() {
    const services = await this.registryService.getServices();
    
    const dashboard: Record<string, any[]> = {};

    for (const service of services) {
      dashboard[service.name] = service.instances?.map((instance) => ({
        host: instance.host,
        port: instance.port,
        status: instance.healthStatus || HealthStatus.HEALTHY,
        latency: instance.averageLatency ? Math.round(instance.averageLatency) : null,
      })) || [];
    }

    return dashboard;
  }
}
