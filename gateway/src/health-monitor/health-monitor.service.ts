import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { RegistryService } from '../registry/registry.service';
import { HealthStatus } from '@gateforge/shared';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class HealthMonitorService {
  private readonly logger = new Logger(HealthMonitorService.name);

  constructor(
    private readonly registryService: RegistryService,
    private readonly httpService: HttpService,
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
    let nextHealthStatus = instance.healthStatus as HealthStatus;
    let nextHealthy = instance.healthy;
    let failureCount = instance.failureCount;
    let successCount = instance.successCount;
    
    const now = new Date();
    let lastHealthyAt = instance.lastHealthyAt;
    let lastFailureAt = instance.lastFailureAt;

    if (success) {
      failureCount = 0;
      successCount += 1;
      
      if (successCount >= 3) {
        nextHealthy = true;
        lastHealthyAt = now;
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
        nextHealthy = false;
        nextHealthStatus = HealthStatus.UNHEALTHY;
        lastFailureAt = now;
      }
    }

    // Exponential Moving Average (EMA) for latency
    const currentEma = instance.averageLatency || latency;
    const averageLatency = (currentEma * 0.8) + (latency * 0.2);

    this.logger.debug(
      `HealthCheck [${instance.host}:${instance.port}] Latency: ${latency}ms, Status: ${nextHealthStatus}, Failures: ${failureCount}, Successes: ${successCount}`
    );

    // Persist new health telemetry
    await this.registryService.updateInstanceHealth(instance.id, {
      healthy: nextHealthy,
      healthStatus: nextHealthStatus,
      failureCount,
      successCount,
      averageLatency,
      lastHealthCheck: now,
      lastHealthyAt,
      lastFailureAt,
    });
  }
}
