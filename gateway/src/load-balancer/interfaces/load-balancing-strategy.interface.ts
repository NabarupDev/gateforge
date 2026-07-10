import { ServiceInstance } from '@gateforge/shared';

export interface LoadBalancingStrategyInterface {
  select(instances: ServiceInstance[]): Promise<ServiceInstance> | ServiceInstance;
}
