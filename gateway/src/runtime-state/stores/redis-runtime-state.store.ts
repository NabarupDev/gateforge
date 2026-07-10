import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { HealthStatus } from '@gateforge/shared';
import { RuntimeStateStore, HealthState, CircuitStateData } from '../interfaces/runtime-state-store.interface';
import { REDIS_CLIENT } from '../../rate-limit/algorithms/sliding-window-log.algorithm';

@Injectable()
export class RedisRuntimeStateStore implements RuntimeStateStore {
  private readonly logger = new Logger(RedisRuntimeStateStore.name);
  
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private getHealthKey(instanceId: string) { return `gf:state:instance:${instanceId}:health`; }
  private getCircuitKey(instanceId: string) { return `gf:state:cb:${instanceId}`; }
  private getConnectionsKey(instanceId: string) { return `gf:state:instance:${instanceId}:connections`; }

  async getHealth(instanceId: string): Promise<HealthState | null> {
    const data = await this.redis.hgetall(this.getHealthKey(instanceId));
    if (!data || Object.keys(data).length === 0) return null;
    
    return {
      status: data.status as HealthStatus,
      latency: data.latency ? Number(data.latency) : null,
      failureCount: Number(data.failureCount || 0),
      successCount: Number(data.successCount || 0),
      lastCheck: data.lastCheck,
    };
  }

  async updateHealth(instanceId: string, state: HealthState): Promise<void> {
    const payload: Record<string, any> = {
      status: state.status,
      failureCount: state.failureCount.toString(),
      successCount: state.successCount.toString(),
    };
    if (state.latency !== undefined && state.latency !== null) {
      payload.latency = state.latency.toString();
    }
    if (state.lastCheck) {
      payload.lastCheck = state.lastCheck.toString();
    }
    
    await this.redis.hmset(this.getHealthKey(instanceId), payload);
    // Expire health data if gateway shuts down (optional, but good practice)
    await this.redis.expire(this.getHealthKey(instanceId), 60 * 60 * 24); // 24 hours
  }

  async getCircuit(instanceId: string): Promise<CircuitStateData | null> {
    const data = await this.redis.hgetall(this.getCircuitKey(instanceId));
    if (!data || Object.keys(data).length === 0) return null;

    return {
      state: data.state as 'CLOSED' | 'OPEN' | 'HALF_OPEN',
      failures: Number(data.failures || 0),
      successes: Number(data.successes || 0),
      openedAt: data.openedAt || null,
      cooldownUntil: data.cooldownUntil || null,
    };
  }

  async updateCircuit(instanceId: string, state: CircuitStateData): Promise<void> {
    const payload: Record<string, string> = {
      state: state.state,
      failures: state.failures.toString(),
      successes: state.successes.toString(),
    };
    if (state.openedAt) payload.openedAt = state.openedAt.toString();
    if (state.cooldownUntil) payload.cooldownUntil = state.cooldownUntil.toString();

    await this.redis.hmset(this.getCircuitKey(instanceId), payload);
    await this.redis.expire(this.getCircuitKey(instanceId), 60 * 60 * 24);
  }

  async getConnections(instanceId: string): Promise<number> {
    const count = await this.redis.get(this.getConnectionsKey(instanceId));
    return count ? parseInt(count, 10) : 0;
  }

  async incrementConnections(instanceId: string): Promise<number> {
    const key = this.getConnectionsKey(instanceId);
    const count = await this.redis.incr(key);
    // Give it a safety TTL so stuck connections drop eventually (e.g., if gateway crashes hard)
    if (count === 1) {
      await this.redis.expire(key, 60 * 10); // 10 minutes
    }
    return count;
  }

  async decrementConnections(instanceId: string): Promise<number> {
    const count = await this.redis.decr(this.getConnectionsKey(instanceId));
    if (count < 0) {
      // Prevent negative connection counts
      await this.redis.set(this.getConnectionsKey(instanceId), 0);
      return 0;
    }
    return count;
  }
}
