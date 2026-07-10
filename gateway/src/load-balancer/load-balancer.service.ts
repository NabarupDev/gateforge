import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Service, ServiceInstance, LoadBalancingStrategy } from '@gateforge/shared';
import { LoadBalancingStrategyInterface } from './interfaces/load-balancing-strategy.interface';
import { RoundRobinStrategy } from './strategies/round-robin.strategy';
import { WeightedRoundRobinStrategy } from './strategies/weighted-round-robin.strategy';
import { LeastConnectionsStrategy } from './strategies/least-connections.strategy';

@Injectable()
export class LoadBalancerService {
  private readonly logger = new Logger(LoadBalancerService.name);
  private readonly strategies: Record<string, LoadBalancingStrategyInterface>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly roundRobinStrategy: RoundRobinStrategy,
    private readonly weightedRoundRobinStrategy: WeightedRoundRobinStrategy,
    private readonly leastConnectionsStrategy: LeastConnectionsStrategy,
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
    const healthyInstances = instances.filter((i) => i.healthy);

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

  async incrementConnections(instanceId: string): Promise<ServiceInstance | null> {
    try {
      const updated = await this.prisma.serviceInstance.update({
        where: { id: instanceId },
        data: { activeConnections: { increment: 1 } },
      });
      return updated as unknown as ServiceInstance;
    } catch (e: any) {
      // Instance might have been deregistered during processing
      return null;
    }
  }

  async decrementConnections(instanceId: string): Promise<ServiceInstance | null> {
    try {
      // Fetch current to avoid negative active connections
      const current = await this.prisma.serviceInstance.findUnique({ where: { id: instanceId } });
      if (!current || current.activeConnections <= 0) {
        return current as unknown as ServiceInstance;
      }
      const updated = await this.prisma.serviceInstance.update({
        where: { id: instanceId },
        data: { activeConnections: { decrement: 1 } },
      });
      return updated as unknown as ServiceInstance;
    } catch (e: any) {
      return null;
    }
  }
}
