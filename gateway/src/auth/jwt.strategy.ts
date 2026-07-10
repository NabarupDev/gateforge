import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthProvider } from './interfaces/auth-provider.interface';
import { RequestUser } from './types/request-user.type';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { DEFAULT_JWT_SECRET } from './auth.constants';

@Injectable()
export class JwtStrategy implements AuthProvider {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async verifyToken(token: string): Promise<RequestUser> {
    try {
      const secret = this.configService.get<string>('JWT_SECRET') || DEFAULT_JWT_SECRET;
      const payload: JwtPayload = await this.jwtService.verifyAsync(token, { secret });

      return {
        ...payload,
        id: String(payload.sub || payload.id || ''),
        email: String(payload.email || ''),
        role: String(payload.role || ''),
        sub: String(payload.sub || payload.id || ''),
      };
    } catch (error: any) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}
