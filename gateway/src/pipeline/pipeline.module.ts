import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import * as http from 'http';
import * as https from 'https';
import { ConfigModule } from '@nestjs/config';
import { RegistryModule } from '../registry/registry.module';
import { InstanceSelectorModule } from '../instance-selector/instance-selector.module';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module';
import { RuntimeStateModule } from '../runtime-state/runtime-state.module';
import { CacheModule } from '../cache/cache.module';
import { PipelineService } from './pipeline.service';
import { ServiceDiscoveryStage } from './stages/service-discovery.stage';
import { CacheStage } from './stages/cache.stage';
import { RetryStage } from './stages/retry.stage';
import { HedgingStage } from './stages/hedging.stage';
import { InstanceSelectionStage } from './stages/instance-selection.stage';
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
    InstanceSelectorModule,
    CircuitBreakerModule,
    RuntimeStateModule,
    CacheModule,
  ],
  providers: [
    PipelineService,
    ServiceDiscoveryStage,
    CacheStage,
    RetryStage,
    HedgingStage,
    InstanceSelectionStage,
    CircuitBreakerStage,
    TimeoutStage,
    HttpClientStage,
  ],
  exports: [
    PipelineService,
    ServiceDiscoveryStage,
    CacheStage,
    RetryStage,
    HedgingStage,
    InstanceSelectionStage,
    CircuitBreakerStage,
    TimeoutStage,
    HttpClientStage,
  ],
})
export class PipelineModule {}
