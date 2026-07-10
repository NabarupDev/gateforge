import { Global, Module } from '@nestjs/common';
import { LoadBalancerService } from './load-balancer.service';
import { RoundRobinStrategy } from './strategies/round-robin.strategy';
import { WeightedRoundRobinStrategy } from './strategies/weighted-round-robin.strategy';
import { LeastConnectionsStrategy } from './strategies/least-connections.strategy';

@Global()
@Module({
  providers: [RoundRobinStrategy, WeightedRoundRobinStrategy, LeastConnectionsStrategy, LoadBalancerService],
  exports: [RoundRobinStrategy, WeightedRoundRobinStrategy, LeastConnectionsStrategy, LoadBalancerService],
})
export class LoadBalancerModule {}
