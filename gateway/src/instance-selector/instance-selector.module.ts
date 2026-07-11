import { Module } from '@nestjs/common';
import { DefaultInstanceSelector } from './default-instance-selector.service';
import { INSTANCE_SELECTOR } from './instance-selector.interface';
import { LoadBalancerModule } from '../load-balancer/load-balancer.module';

@Module({
  imports: [LoadBalancerModule],
  providers: [
    {
      provide: INSTANCE_SELECTOR,
      useClass: DefaultInstanceSelector,
    },
  ],
  exports: [INSTANCE_SELECTOR],
})
export class InstanceSelectorModule {}
