import { Injectable, NotFoundException } from '@nestjs/common';
import { RequestStage, NextFunction } from '../interfaces/request-stage.interface';
import { RequestContext } from '../interfaces/request-context.interface';
import { ProxyResponse } from '../interfaces/proxy-response.interface';
import { RegistryService } from '../../registry/registry.service';
import { ConfigService } from '@nestjs/config';
import { RouteConfig } from '../../config/gateway.config';

@Injectable()
export class ServiceDiscoveryStage implements RequestStage {
  constructor(
    private readonly registryService: RegistryService,
    private readonly configService: ConfigService,
  ) {}

  async execute(context: RequestContext, next: NextFunction): Promise<ProxyResponse> {
    const req = context.req;
    const urlPath = req.url || req.originalUrl || '/';
    const pathOnly = urlPath.split('?')[0];

    const service = await this.registryService.findServiceByPath(urlPath);

    if (service) {
      context.service = service;
    } else {
      // Fallback to static routes
      const routes = this.configService.get<RouteConfig[]>('gateway.routes') || [];
      const matchedRoute = routes.find((route) => pathOnly.startsWith(route.pathPrefix));

      if (!matchedRoute) {
        throw new NotFoundException({
          success: false,
          error: {
            code: 'ROUTE_NOT_FOUND',
            message: `No route configured for path ${pathOnly}`,
          },
          timestamp: new Date().toISOString(),
        });
      }
      
      // Static routes do not have a service config, so we mock basic properties if needed,
      // or we just set targetUrl and rely on defaults downstream.
      context.targetUrl = `${matchedRoute.target}${urlPath}`;
    }

    return next();
  }
}
