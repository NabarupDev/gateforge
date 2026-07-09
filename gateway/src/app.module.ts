import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ProxyModule } from './proxy/proxy.module';
import { RoutingModule } from './routing/routing.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { CacheModule } from './cache/cache.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { LoggingModule } from './logging/logging.module';
import { ServiceDiscoveryModule } from './service-discovery/service-discovery.module';
import { LoadBalancerModule } from './load-balancer/load-balancer.module';
import { HealthModule } from './health/health.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [AuthModule, ProxyModule, RoutingModule, RateLimitModule, CacheModule, AnalyticsModule, LoggingModule, ServiceDiscoveryModule, LoadBalancerModule, HealthModule, ApiKeyModule, CommonModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
