import { Injectable, Logger, Inject } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { RegistryService } from '../registry/registry.service';
import { HealthStatus } from '@gateforge/shared';
import { lastValueFrom } from 'rxjs';
import { RUNTIME_STATE_STORE } from '../runtime-state/interfaces/runtime-state-store.interface';
import type { RuntimeStateStore } from '../runtime-state/interfaces/runtime-state-store.interface';

@Injectable()
export class HealthMonitorService {
  private readonly logger = new Logger(HealthMonitorService.name);

  constructor(
    private readonly registryService: RegistryService,
    private readonly httpService: HttpService,
    @Inject(RUNTIME_STATE_STORE) private readonly stateStore: RuntimeStateStore,
  ) {}

  @Interval(5000)
  async probeInstances() {
    const instances = await this.registryService.getAllInstances();
    
    for (const instance of instances) {
      if (!instance.service.enabled) continue;
      await this.probeInstance(instance);
    }
  }

  private async probeInstance(instance: any) {
    const start = Date.now();
    let success = false;
    
    try {
      const response = await lastValueFrom(
        this.httpService.get(`http://${instance.host}:${instance.port}/health`, {
          timeout: 4000,
          validateStatus: () => true, // resolve on any status
        })
      );
      success = response.status === 200;
    } catch (error) {
      success = false;
    }

    const latency = Date.now() - start;

    // Retrieve previous state from Redis
    const previousState = await this.stateStore.getHealth(instance.id) || {
      status: HealthStatus.HEALTHY,
      failureCount: 0,
      successCount: 0,
      latency: 0,
    };

    let nextHealthStatus = previousState.status as HealthStatus;
    let failureCount = previousState.failureCount;
    let successCount = previousState.successCount;
    
    const now = new Date();

    if (success) {
      failureCount = 0;
      successCount += 1;
      
      if (successCount >= 3) {
        if (latency < 1500) {
          nextHealthStatus = HealthStatus.HEALTHY;
        } else {
          nextHealthStatus = HealthStatus.DEGRADED;
        }
      }
    } else {
      successCount = 0;
      failureCount += 1;
      
      if (failureCount >= 3) {
        nextHealthStatus = HealthStatus.UNHEALTHY;
      }
    }

    // Exponential Moving Average (EMA) for latency
    const currentEma = previousState.latency || latency;
    const averageLatency = (currentEma * 0.8) + (latency * 0.2);

    this.logger.debug(
      `HealthCheck [${instance.host}:${instance.port}] Latency: ${latency}ms, Status: ${nextHealthStatus}, Failures: ${failureCount}, Successes: ${successCount}`
    );

    // Persist new health telemetry to Redis
    await this.stateStore.updateHealth(instance.id, {
      status: nextHealthStatus,
      failureCount,
      successCount,
      latency: averageLatency,
      lastCheck: now.toISOString(),
    });
  }
}
