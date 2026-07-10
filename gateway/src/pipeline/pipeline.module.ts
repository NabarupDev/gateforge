import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import * as http from 'http';
import * as https from 'https';
import { ConfigModule } from '@nestjs/config';
import { RegistryModule } from '../registry/registry.module';
import { LoadBalancerModule } from '../load-balancer/load-balancer.module';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module';
import { RuntimeStateModule } from '../runtime-state/runtime-state.module';
import { PipelineService } from './pipeline.service';
import { ServiceDiscoveryStage } from './stages/service-discovery.stage';
import { RetryStage } from './stages/retry.stage';
import { HedgingStage } from './stages/hedging.stage';
import { LoadBalancerStage } from './stages/load-balancer.stage';
import { CircuitBreakerStage } from './stages/circuit-breaker.stage';
import { TimeoutStage } from './stages/timeout.stage';
import { HttpClientStage } from './stages/http-client.stage';

@Module({
  imports: [
    HttpModule.register({
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 100 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 100 }),
      timeout: 30000,
    }),
    ConfigModule,
    RegistryModule,
    LoadBalancerModule,
    CircuitBreakerModule,
    RuntimeStateModule,
  ],
  providers: [
    PipelineService,
    ServiceDiscoveryStage,
    RetryStage,
    HedgingStage,
    LoadBalancerStage,
    CircuitBreakerStage,
    TimeoutStage,
    HttpClientStage,
  ],
  exports: [
    PipelineService,
    ServiceDiscoveryStage,
    RetryStage,
    HedgingStage,
    LoadBalancerStage,
    CircuitBreakerStage,
    TimeoutStage,
    HttpClientStage,
  ],
})
export class PipelineModule {}
