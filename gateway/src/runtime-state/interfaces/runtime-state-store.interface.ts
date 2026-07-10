import { HealthStatus } from '@gateforge/shared';

export interface HealthState {
  status: HealthStatus | string;
  latency?: number | null;
  failureCount: number;
  successCount: number;
  lastCheck?: Date | string | null;
}

export interface CircuitStateData {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  successes: number;
  openedAt?: Date | string | null;
  cooldownUntil?: Date | string | null;
}

export const RUNTIME_STATE_STORE = Symbol('RUNTIME_STATE_STORE');

export interface RuntimeStateStore {
  getHealth(instanceId: string): Promise<HealthState | null>;
  updateHealth(instanceId: string, state: HealthState): Promise<void>;

  getCircuit(instanceId: string): Promise<CircuitStateData | null>;
  updateCircuit(instanceId: string, state: CircuitStateData): Promise<void>;

  getConnections(instanceId: string): Promise<number>;
  incrementConnections(instanceId: string): Promise<number>;
  decrementConnections(instanceId: string): Promise<number>;

  // Phase 8: Retry Budget & Service Metrics
  getServiceMetrics(serviceId: string): Promise<{ requests: number; retries: number; timeouts: number; successAfterRetry: number }>;
  incrementServiceMetric(serviceId: string, metric: 'requests' | 'retries' | 'timeouts' | 'successAfterRetry'): Promise<void>;
}
