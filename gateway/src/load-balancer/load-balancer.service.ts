import { Injectable, Logger, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Service, ServiceInstance, LoadBalancingStrategy, HealthStatus } from '@gateforge/shared';
import { LoadBalancingStrategyInterface } from './interfaces/load-balancing-strategy.interface';
import { RoundRobinStrategy } from './strategies/round-robin.strategy';
import { WeightedRoundRobinStrategy } from './strategies/weighted-round-robin.strategy';
import { LeastConnectionsStrategy } from './strategies/least-connections.strategy';
import { RUNTIME_STATE_STORE } from '../runtime-state/interfaces/runtime-state-store.interface';
import type { RuntimeStateStore } from '../runtime-state/interfaces/runtime-state-store.interface';

@Injectable()
export class LoadBalancerService {
  private readonly logger = new Logger(LoadBalancerService.name);
  private readonly strategies: Record<string, LoadBalancingStrategyInterface>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly roundRobinStrategy: RoundRobinStrategy,
    private readonly weightedRoundRobinStrategy: WeightedRoundRobinStrategy,
    private readonly leastConnectionsStrategy: LeastConnectionsStrategy,
    @Inject(RUNTIME_STATE_STORE) private readonly stateStore: RuntimeStateStore,
  ) {
    this.strategies = {
      [LoadBalancingStrategy.ROUND_ROBIN]: this.roundRobinStrategy,
      [LoadBalancingStrategy.WEIGHTED_ROUND_ROBIN]: this.weightedRoundRobinStrategy,
      [LoadBalancingStrategy.LEAST_CONNECTIONS]: this.leastConnectionsStrategy,
    };
  }

  registerStrategy(name: string, strategy: LoadBalancingStrategyInterface) {
    this.strategies[name] = strategy;
  }

  async selectInstance(service: Service & { instances?: ServiceInstance[] }): Promise<ServiceInstance> {
    const instances = service.instances || [];
    
    // Eligible for routing: HEALTHY or DEGRADED. Filter out UNHEALTHY based on RuntimeStateStore.
    const healthyInstances: ServiceInstance[] = [];

    for (const instance of instances) {
      const state = await this.stateStore.getHealth(instance.id);
      
      // If we don't have health state yet, assume healthy until checked
      const status = state ? state.status : HealthStatus.HEALTHY;
      
      if (status === HealthStatus.HEALTHY || status === HealthStatus.DEGRADED) {
        // Hydrate the instance active connections count for LeastConnectionsStrategy
        const activeConnections = await this.stateStore.getConnections(instance.id);
        healthyInstances.push({
          ...instance,
          activeConnections,
        });
      }
    }

    if (healthyInstances.length === 0) {
      this.logger.warn(`No healthy instances available for service "${service.name}"`);
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: `No healthy instances available for service "${service.name}"`,
          },
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const strategyName = String(service.strategy || LoadBalancingStrategy.ROUND_ROBIN);
    const strategy = this.strategies[strategyName] || this.strategies[LoadBalancingStrategy.ROUND_ROBIN];

    const selected = await strategy.select(healthyInstances);
    return selected;
  }

  async incrementConnections(instanceId: string): Promise<number> {
    return this.stateStore.incrementConnections(instanceId);
  }

  async decrementConnections(instanceId: string): Promise<number> {
    return this.stateStore.decrementConnections(instanceId);
  }
}
