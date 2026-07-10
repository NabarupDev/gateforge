import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { GatewayJwtService } from './jwt.service';
import { AuthController } from './auth.controller';
import { GatewayAuthGuard } from './auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { AUTH_PROVIDER, DEFAULT_JWT_SECRET } from './auth.constants';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || DEFAULT_JWT_SECRET,
        signOptions: { expiresIn: '1h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GatewayJwtService,
    JwtStrategy,
    {
      provide: AUTH_PROVIDER,
      useClass: JwtStrategy,
    },
    {
      provide: APP_GUARD,
      useClass: GatewayAuthGuard,
    },
  ],
  exports: [AuthService, GatewayJwtService, JwtModule, AUTH_PROVIDER],
})
export class AuthModule {}
