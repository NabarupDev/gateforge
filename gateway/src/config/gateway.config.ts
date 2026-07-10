import { registerAs } from '@nestjs/config';

export interface RouteConfig {
  pathPrefix: string;
  target: string;
  isPublic?: boolean;
  requiredRoles?: string[];
}

export interface GatewayConfig {
  routes: RouteConfig[];
}

export default registerAs('gateway', (): GatewayConfig => ({
  routes: [
    {
      pathPrefix: '/users',
      target: process.env.USER_SERVICE_URL || 'http://localhost:3001',
      isPublic: false,
    },
    {
      pathPrefix: '/admin',
      target: process.env.USER_SERVICE_URL || 'http://localhost:3001',
      isPublic: false,
      requiredRoles: ['admin'],
    },
    {
      pathPrefix: '/consumers',
      target: process.env.USER_SERVICE_URL || 'http://localhost:3001',
      isPublic: false,
    },
  ],
}));
