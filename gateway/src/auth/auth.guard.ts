import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { ROLES_KEY } from './decorators/roles.decorator';
import { RouteConfig } from '../config/gateway.config';
import { AuthenticationManagerService } from './authentication-manager.service';
import {
  HEADER_USER_ID,
  HEADER_USER_EMAIL,
  HEADER_USER_ROLE,
  HEADER_REQUEST_ID,
  HEADER_REQUEST_ID_UPPER,
  HEADER_AUTH_TYPE,
  HEADER_CONSUMER_ID,
  HEADER_API_KEY_ID,
} from './auth.constants';

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly authManager: AuthenticationManagerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Step 7: Ensure X-Request-ID exists on every request and response
    this.ensureRequestId(request, response);

    // Step 3: Check @Public() metadata on handler/class
    const isPublicReflector = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublicReflector) {
      return true;
    }

    const urlPath = request.url || request.originalUrl || '/';
    const pathOnly = urlPath.split('?')[0];

    // Check if route matches config-based public rules
    const routes = this.configService.get<RouteConfig[]>('gateway.routes') || [];
    const matchedRoute = routes.find((route) => pathOnly.startsWith(route.pathPrefix));

    if (matchedRoute && matchedRoute.isPublic === true) {
      return true;
    }

    // Authenticate using multi-provider authentication chain (JWT first, API Key second)
    const principal = await this.authManager.authenticate(request);
    request.auth = principal;
    request.user = principal;
    if (request.raw) {
      request.raw.auth = principal;
      request.raw.user = principal;
    }

    // Step 5: Check Role Restrictions (@Roles() or route config requiredRoles)
    const requiredRolesReflector = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredRoles = requiredRolesReflector || matchedRoute?.requiredRoles || [];

    if (requiredRoles.length > 0) {
      const principalRole = principal?.role;
      if (!principalRole || !requiredRoles.includes(principalRole)) {
        throw new ForbiddenException({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions',
          },
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Identity & Request ID Propagation into downstream HTTP headers
    const requestId = request.requestId || request.headers[HEADER_REQUEST_ID] || randomUUID();
    if (!request.headers) request.headers = {};
    if (request.raw && !request.raw.headers) request.raw.headers = {};

    const injectHeader = (key: string, value: string) => {
      request.headers[key] = value;
      if (request.raw && request.raw.headers) {
        request.raw.headers[key] = value;
      }
    };

    injectHeader(HEADER_AUTH_TYPE, principal.type);
    injectHeader(HEADER_REQUEST_ID, requestId);
    injectHeader(HEADER_REQUEST_ID_UPPER, requestId);

    if (principal.type === 'jwt') {
      injectHeader(HEADER_USER_ID, String(principal.userId || principal.id || ''));
      injectHeader(HEADER_USER_EMAIL, String(principal.email || ''));
      injectHeader(HEADER_USER_ROLE, String(principal.role || ''));
    } else if (principal.type === 'api-key') {
      injectHeader(HEADER_CONSUMER_ID, String(principal.consumerId || principal.id || ''));
      injectHeader(HEADER_API_KEY_ID, String(principal.keyId || ''));
      injectHeader(HEADER_USER_ROLE, String(principal.role || 'consumer'));
    }

    return true;
  }

  private ensureRequestId(request: any, response: any): void {
    const headers = request.headers || (request.raw && request.raw.headers) || {};
    const existingId =
      headers[HEADER_REQUEST_ID] ||
      headers[HEADER_REQUEST_ID_UPPER] ||
      headers['x-request-id'] ||
      headers['X-Request-Id'];
    const requestId = typeof existingId === 'string' && existingId.trim() ? existingId : randomUUID();

    request.requestId = requestId;
    if (request.raw) request.raw.requestId = requestId;

    if (!request.headers) request.headers = {};
    request.headers[HEADER_REQUEST_ID] = requestId;
    request.headers[HEADER_REQUEST_ID_UPPER] = requestId;

    if (request.raw && request.raw.headers) {
      request.raw.headers[HEADER_REQUEST_ID] = requestId;
      request.raw.headers[HEADER_REQUEST_ID_UPPER] = requestId;
    }

    if (response && typeof response.header === 'function') {
      response.header(HEADER_REQUEST_ID_UPPER, requestId);
    } else if (response && typeof response.setHeader === 'function') {
      response.setHeader(HEADER_REQUEST_ID_UPPER, requestId);
    } else if (response && response.raw && typeof response.raw.setHeader === 'function') {
      response.raw.setHeader(HEADER_REQUEST_ID_UPPER, requestId);
    }
  }
}
