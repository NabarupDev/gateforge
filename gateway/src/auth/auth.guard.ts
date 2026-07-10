import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { ROLES_KEY } from './decorators/roles.decorator';
import { RouteConfig } from '../config/gateway.config';
import type { AuthProvider } from './interfaces/auth-provider.interface';
import {
  AUTH_PROVIDER,
  HEADER_USER_ID,
  HEADER_USER_EMAIL,
  HEADER_USER_ROLE,
  HEADER_REQUEST_ID,
  HEADER_REQUEST_ID_UPPER,
} from './auth.constants';

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
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

    // Step 1: Extract Bearer Token
    const token = this.extractTokenFromHeader(request);
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

    // Step 2: Verify Token using AuthProvider interface
    try {
      const user = await this.authProvider.verifyToken(token);
      request.user = user;
      if (request.raw) {
        request.raw.user = user;
      }
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

    // Step 5: Check Role Restrictions (@Roles() or route config requiredRoles)
    const requiredRolesReflector = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredRoles = requiredRolesReflector || matchedRoute?.requiredRoles || [];

    if (requiredRoles.length > 0) {
      const userRole = request.user?.role;
      if (!userRole || !requiredRoles.includes(userRole)) {
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

    // Step 6: Identity & Request ID Propagation into downstream HTTP headers
    const userId = String(request.user.id || request.user.sub || '');
    const userEmail = String(request.user.email || '');
    const userRole = String(request.user.role || '');
    const requestId = request.requestId || request.headers[HEADER_REQUEST_ID] || randomUUID();

    if (!request.headers) request.headers = {};
    request.headers[HEADER_USER_ID] = userId;
    request.headers[HEADER_USER_EMAIL] = userEmail;
    request.headers[HEADER_USER_ROLE] = userRole;
    request.headers[HEADER_REQUEST_ID] = requestId;
    request.headers[HEADER_REQUEST_ID_UPPER] = requestId;

    if (request.raw && request.raw.headers) {
      request.raw.headers[HEADER_USER_ID] = userId;
      request.raw.headers[HEADER_USER_EMAIL] = userEmail;
      request.raw.headers[HEADER_USER_ROLE] = userRole;
      request.raw.headers[HEADER_REQUEST_ID] = requestId;
      request.raw.headers[HEADER_REQUEST_ID_UPPER] = requestId;
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

    // Set on response
    if (response && typeof response.header === 'function') {
      response.header(HEADER_REQUEST_ID_UPPER, requestId);
    } else if (response && typeof response.setHeader === 'function') {
      response.setHeader(HEADER_REQUEST_ID_UPPER, requestId);
    } else if (response && response.raw && typeof response.raw.setHeader === 'function') {
      response.raw.setHeader(HEADER_REQUEST_ID_UPPER, requestId);
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const headers = request.headers || (request.raw && request.raw.headers) || {};
    const authHeader = headers.authorization || headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      return undefined;
    }
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
