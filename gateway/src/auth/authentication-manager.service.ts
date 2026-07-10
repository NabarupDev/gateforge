import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthenticationProvider } from './interfaces/authentication-provider.interface';
import { AuthenticatedPrincipal } from '@gateforge/shared';
import { JwtAuthenticationProvider } from './providers/jwt-authentication.provider';
import { ApiKeyAuthenticationProvider } from './providers/api-key-authentication.provider';

@Injectable()
export class AuthenticationManagerService {
  private readonly providers: AuthenticationProvider[];

  constructor(
    private readonly jwtProvider: JwtAuthenticationProvider,
    private readonly apiKeyProvider: ApiKeyAuthenticationProvider,
  ) {
    // Registered in priority order: JWT takes precedence over API Key
    this.providers = [this.jwtProvider, this.apiKeyProvider];
  }

  registerProvider(provider: AuthenticationProvider) {
    this.providers.push(provider);
  }

  async authenticate(request: any): Promise<AuthenticatedPrincipal> {
    for (const provider of this.providers) {
      if (provider.canAuthenticate(request)) {
        const principal = await provider.authenticate(request);
        if (principal) {
          return principal;
        }
      }
    }

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
