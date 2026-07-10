import { Global, Module } from '@nestjs/common';
import { LoadBalancerService } from './load-balancer.service';
import { RoundRobinStrategy } from './strategies/round-robin.strategy';
import { WeightedRoundRobinStrategy } from './strategies/weighted-round-robin.strategy';

@Global()
@Module({
  providers: [RoundRobinStrategy, WeightedRoundRobinStrategy, LoadBalancerService],
  exports: [RoundRobinStrategy, WeightedRoundRobinStrategy, LoadBalancerService],
})
export class LoadBalancerModule {}
