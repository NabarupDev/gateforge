import { Global, Module } from '@nestjs/common';
import { LoadBalancerService } from './load-balancer.service';
import { RoundRobinStrategy } from './strategies/round-robin.strategy';

@Global()
@Module({
  providers: [RoundRobinStrategy, LoadBalancerService],
  exports: [RoundRobinStrategy, LoadBalancerService],
})
export class LoadBalancerModule {}
