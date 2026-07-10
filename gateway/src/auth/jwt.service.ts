import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { DEFAULT_JWT_SECRET } from './auth.constants';

@Injectable()
export class GatewayJwtService {
  constructor(
    private readonly jwtService: NestJwtService,
    private readonly configService: ConfigService,
  ) {}

  async sign(payload: Partial<JwtPayload> | Record<string, any>, expiresIn: string | number = '1h'): Promise<string> {
    const secret = this.configService.get<string>('JWT_SECRET') || DEFAULT_JWT_SECRET;
    return this.jwtService.signAsync(payload as Record<string, any>, { secret, expiresIn: expiresIn as any });
  }

  async verify(token: string): Promise<JwtPayload> {
    const secret = this.configService.get<string>('JWT_SECRET') || DEFAULT_JWT_SECRET;
    return this.jwtService.verifyAsync<JwtPayload>(token, { secret });
  }
}
