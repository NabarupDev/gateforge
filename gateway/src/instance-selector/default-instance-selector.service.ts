import { Injectable, Logger } from '@nestjs/common';
import { InstanceSelector } from './instance-selector.interface';
import { RequestContext } from '../pipeline/interfaces/request-context.interface';
import { ServiceInstance } from '@gateforge/shared';
import { LoadBalancerService } from '../load-balancer/load-balancer.service';

@Injectable()
export class DefaultInstanceSelector implements InstanceSelector {
  private readonly logger = new Logger(DefaultInstanceSelector.name);

  constructor(
    private readonly loadBalancerService: LoadBalancerService
  ) {}

  async select(context: RequestContext): Promise<ServiceInstance> {
    if (!context.service) {
      throw new Error('Service is not set on RequestContext');
    }
    // The LoadBalancerService intrinsically relies on Registry (for the service definition)
    // and RuntimeStateStore (for health checks).
    return this.loadBalancerService.selectInstance(context.service);
  }

  async incrementConnections(instanceId: string): Promise<number> {
    return this.loadBalancerService.incrementConnections(instanceId);
  }

  async decrementConnections(instanceId: string): Promise<number> {
    return this.loadBalancerService.decrementConnections(instanceId);
  }
}
