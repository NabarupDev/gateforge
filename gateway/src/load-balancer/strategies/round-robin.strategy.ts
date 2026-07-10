import { Injectable } from '@nestjs/common';
import { ServiceInstance } from '@gateforge/shared';
import { LoadBalancingStrategyInterface } from '../interfaces/load-balancing-strategy.interface';

@Injectable()
export class RoundRobinStrategy implements LoadBalancingStrategyInterface {
  private readonly counters = new Map<string, number>();

  select(instances: ServiceInstance[]): ServiceInstance {
    if (!instances || instances.length === 0) {
      throw new Error('No instances available for round robin selection.');
    }

    // Sort consistently by port then id to ensure deterministic selection across calls
    const sorted = instances.slice().sort((a, b) => a.port - b.port || a.id.localeCompare(b.id));
    const serviceId = sorted[0].serviceId;

    const currentIndex = (this.counters.get(serviceId) ?? 0) % sorted.length;
    const selected = sorted[currentIndex];

    this.counters.set(serviceId, (currentIndex + 1) % sorted.length);
    return selected;
  }
}
