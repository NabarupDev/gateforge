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
import { ApiKeyModule } from './api-key/api-key.module';
import gatewayConfig from './config/gateway.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [gatewayConfig],
    }),
    DatabaseModule,
    RegistryModule,
    ApiKeyModule,
    AuthModule,
    RateLimitModule,
    ProxyModule,
    LoggingModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
