import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthenticationProvider } from '../interfaces/authentication-provider.interface';
import { AuthenticatedPrincipal } from '@gateforge/shared';
import { JwtStrategy } from '../jwt.strategy';

@Injectable()
export class JwtAuthenticationProvider implements AuthenticationProvider {
  constructor(private readonly jwtStrategy: JwtStrategy) {}

  canAuthenticate(request: any): boolean {
    const authHeader = request.headers?.authorization || request.headers?.Authorization;
    return typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
  }

  async authenticate(request: any): Promise<AuthenticatedPrincipal | null> {
    const authHeader = request.headers?.authorization || request.headers?.Authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      return null;
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const user = await this.jwtStrategy.verifyToken(token);
      return {
        type: 'jwt',
        id: user.id,
        userId: user.id,
        email: user.email,
        role: user.role,
        scopes: [],
      };
    } catch (err) {
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
