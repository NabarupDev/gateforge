import { ServiceInstance } from '@gateforge/shared';
import { RequestContext } from '../pipeline/interfaces/request-context.interface';

export interface InstanceSelector {
  /**
   * Selects a healthy ServiceInstance for the given RequestContext.
   */
  select(context: RequestContext): Promise<ServiceInstance>;

  /**
   * Record that a connection is starting for this instance.
   * Returns the new active connection count.
   */
  incrementConnections(instanceId: string): Promise<number>;

  /**
   * Record that a connection has finished for this instance.
   * Returns the new active connection count.
   */
  decrementConnections(instanceId: string): Promise<number>;
}

export const INSTANCE_SELECTOR = Symbol('INSTANCE_SELECTOR');
