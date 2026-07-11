import { Injectable, Logger, Inject } from '@nestjs/common';
import { RUNTIME_STATE_STORE, CircuitStateData } from '../runtime-state/interfaces/runtime-state-store.interface';
import type { RuntimeStateStore } from '../runtime-state/interfaces/runtime-state-store.interface';
import { GATEFORGE_CIRCUIT_OPEN } from '../telemetry/telemetry.module';
import { Counter } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  // Configurables (can be moved to ConfigService later)
  private readonly failureThreshold = 5;
  private readonly cooldownMs = 30000; // 30 seconds

  constructor(
    @Inject(RUNTIME_STATE_STORE) private readonly stateStore: RuntimeStateStore,
    @InjectMetric(GATEFORGE_CIRCUIT_OPEN) private readonly circuitOpenTotal: Counter<string>
  ) {}

  async checkState(instanceId: string): Promise<'CLOSED' | 'OPEN' | 'HALF_OPEN'> {
    let cb = await this.stateStore.getCircuit(instanceId);
    
    // If no state exists, it's implicitly CLOSED
    if (!cb) {
      return 'CLOSED';
    }

    if (cb.state === 'OPEN') {
      const now = Date.now();
      const cooldownUntil = cb.cooldownUntil ? new Date(cb.cooldownUntil).getTime() : 0;
      
      // Cooldown expired -> HALF_OPEN
      if (now >= cooldownUntil) {
        cb.state = 'HALF_OPEN';
        await this.stateStore.updateCircuit(instanceId, cb);
        this.logger.warn(`CIRCUIT_HALF_OPEN for instance ${instanceId}. Allowing one test request.`);
        return 'HALF_OPEN';
      }
    }

    return cb.state;
  }

  async recordSuccess(instanceId: string): Promise<void> {
    const cb = await this.stateStore.getCircuit(instanceId);
    
    // If it was already CLOSED and no failures, do nothing to save Redis writes
    if (!cb || (cb.state === 'CLOSED' && cb.failures === 0)) {
      return;
    }

    if (cb.state === 'HALF_OPEN' || cb.failures > 0) {
      cb.state = 'CLOSED';
      cb.failures = 0;
      cb.successes += 1;
      cb.cooldownUntil = null;
      cb.openedAt = null;

      await this.stateStore.updateCircuit(instanceId, cb);
      this.logger.log(`CIRCUIT_CLOSED for instance ${instanceId}. Service recovered.`);
    }
  }

  async recordFailure(instanceId: string): Promise<void> {
    let cb = await this.stateStore.getCircuit(instanceId);

    if (!cb) {
      cb = {
        state: 'CLOSED',
        failures: 0,
        successes: 0,
      };
    }

    cb.failures += 1;

    if (cb.state === 'HALF_OPEN') {
      // Failed during HALF_OPEN -> immediate OPEN
      this.tripCircuit(instanceId, cb);
    } else if (cb.state === 'CLOSED' && cb.failures >= this.failureThreshold) {
      // Reached threshold -> OPEN
      this.tripCircuit(instanceId, cb);
    } else {
      // Just increment failure count
      await this.stateStore.updateCircuit(instanceId, cb);
    }
  }

  private async tripCircuit(instanceId: string, cb: CircuitStateData) {
    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + this.cooldownMs);

    cb.state = 'OPEN';
    cb.openedAt = now.toISOString();
    cb.cooldownUntil = cooldownUntil.toISOString();

    await this.stateStore.updateCircuit(instanceId, cb);
    this.circuitOpenTotal.labels('unknown', instanceId).inc();
    
    this.logger.error(JSON.stringify({
      event: 'CIRCUIT_OPEN',
      instance: instanceId,
      failures: cb.failures,
      cooldownMs: this.cooldownMs,
    }));
  }
}
