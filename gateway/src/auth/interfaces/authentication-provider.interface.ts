import { AuthenticatedPrincipal } from '@gateforge/shared';

export interface AuthenticationProvider {
  canAuthenticate(request: any): boolean;
  authenticate(request: any): Promise<AuthenticatedPrincipal | null>;
}
