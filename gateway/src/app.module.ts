import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProxyModule } from './proxy/proxy.module';
import { LoggingModule } from './logging/logging.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { DatabaseModule } from './database/database.module';
import { RegistryModule } from './registry/registry.module';
import { LoadBalancerModule } from './load-balancer/load-balancer.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { HealthMonitorModule } from './health-monitor/health-monitor.module';
import { RuntimeStateModule } from './runtime-state/runtime-state.module';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';
import { RetryModule } from './retry/retry.module';
import gatewayConfig from './config/gateway.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [gatewayConfig],
    }),
    DatabaseModule,
    RegistryModule,
    LoadBalancerModule,
    ApiKeyModule,
    AuthModule,
    RateLimitModule,
    HealthMonitorModule,
    RuntimeStateModule,
    CircuitBreakerModule,
    RetryModule,
    ProxyModule,
    LoggingModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
