import { Injectable } from '@nestjs/common';
import { ServiceInstance } from '@gateforge/shared';
import { LoadBalancingStrategyInterface } from '../interfaces/load-balancing-strategy.interface';

@Injectable()
export class LeastConnectionsStrategy implements LoadBalancingStrategyInterface {
  private readonly counters = new Map<string, number>();

  select(instances: ServiceInstance[]): ServiceInstance {
    if (!instances || instances.length === 0) {
      throw new Error('No instances available for least connections selection.');
    }

    let minConnections = Infinity;
    for (const instance of instances) {
      const active = instance.activeConnections || 0;
      if (active < minConnections) {
        minConnections = active;
      }
    }

    const candidates = instances
      .filter((i) => (i.activeConnections || 0) === minConnections)
      .sort((a, b) => a.port - b.port || a.id.localeCompare(b.id));

    const serviceId = candidates[0].serviceId;
    const currentIndex = (this.counters.get(serviceId) ?? 0) % candidates.length;
    const selected = candidates[currentIndex];

    this.counters.set(serviceId, (currentIndex + 1) % candidates.length);
    return selected;
  }
}
