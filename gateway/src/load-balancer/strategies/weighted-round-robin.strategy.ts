import { Injectable } from '@nestjs/common';
import { ServiceInstance } from '@gateforge/shared';
import { LoadBalancingStrategyInterface } from '../interfaces/load-balancing-strategy.interface';

@Injectable()
export class WeightedRoundRobinStrategy implements LoadBalancingStrategyInterface {
  private readonly currentWeights = new Map<string, number>();

  select(instances: ServiceInstance[]): ServiceInstance {
    if (!instances || instances.length === 0) {
      throw new Error('No instances available for weighted round robin selection.');
    }

    // Sort by port/id to ensure deterministic tie-breaking across identical weights
    const sorted = instances.slice().sort((a, b) => a.port - b.port || a.id.localeCompare(b.id));

    let totalWeight = 0;
    let bestInstance: ServiceInstance | null = null;
    let maxCurrentWeight = -Infinity;

    for (const instance of sorted) {
      const weight = Math.max(1, instance.weight || 1);
      totalWeight += weight;

      const current = (this.currentWeights.get(instance.id) ?? 0) + weight;
      this.currentWeights.set(instance.id, current);

      if (bestInstance === null || current > maxCurrentWeight) {
        bestInstance = instance;
        maxCurrentWeight = current;
      }
    }

    if (!bestInstance) {
      return sorted[0];
    }

    // Subtract total weight from the selected instance's current weight (Smooth Weighted Round Robin)
    const bestCurrent = this.currentWeights.get(bestInstance.id) ?? 0;
    this.currentWeights.set(bestInstance.id, bestCurrent - totalWeight);

    return bestInstance;
  }
}
