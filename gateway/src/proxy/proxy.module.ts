import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';
import gatewayConfig from '../config/gateway.config';

@Module({
  imports: [
    HttpModule,
    ConfigModule.forFeature(gatewayConfig),
  ],
  controllers: [ProxyController],
  providers: [ProxyService],
  exports: [ProxyService],
})
export class ProxyModule {}
