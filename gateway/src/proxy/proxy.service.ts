import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { RouteConfig } from '../config/gateway.config';
import { RegistryService } from '../registry/registry.service';
import { LoadBalancerService } from '../load-balancer/load-balancer.service';

export interface ProxyResponse {
  status: number;
  data: any;
  headers: Record<string, any>;
  targetUrl: string;
}

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly registryService: RegistryService,
    private readonly loadBalancerService: LoadBalancerService,
  ) {}

  async forwardRequest(req: any): Promise<ProxyResponse> {
    const urlPath = req.url || req.originalUrl || '/';
    const pathOnly = urlPath.split('?')[0];

    // 1. Check dynamic service registry first
    const service = await this.registryService.findServiceByPath(urlPath);
    let targetUrl: string;
    let selectedInstanceId: string | null = null;
    let backendName = 'StaticBackend';

    if (service) {
      const instance = await this.loadBalancerService.selectInstance(service);
      selectedInstanceId = instance.id;
      const activeInst = await this.loadBalancerService.incrementConnections(instance.id);

      targetUrl = `http://${instance.host}:${instance.port}${urlPath}`;
      backendName = `${service.name} (${instance.host}:${instance.port})`;

      this.logger.log(JSON.stringify({
        event: 'LOAD_BALANCER_ROUTING',
        requestId: req.headers?.['x-request-id'] || 'unknown',
        service: service.name,
        strategy: service.strategy,
        selectedInstance: `${instance.host}:${instance.port}`,
        instanceId: instance.id,
        activeConnections: activeInst ? activeInst.activeConnections : instance.activeConnections + 1,
      }));
    } else {
      // 2. Fallback to static routes
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

      targetUrl = `${matchedRoute.target}${urlPath}`;
      backendName = matchedRoute.target;
    }

    // Clean headers before forwarding
    const headers = this.cleanHeaders(req.headers || {});

    // Prepare axios request config
    const method = (req.method || 'GET').toUpperCase();
    const config: AxiosRequestConfig = {
      method,
      url: targetUrl,
      headers,
      validateStatus: () => true, // Never throw on 4xx/5xx responses from backend
    };

    // Attach body for methods that support it
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && req.body && Object.keys(req.body).length > 0) {
      config.data = req.body;
    }

    try {
      const response: AxiosResponse = await firstValueFrom(
        this.httpService.request(config),
      );

      // Clean response headers before returning to client
      const responseHeaders = this.cleanResponseHeaders(response.headers || {});

      return {
        status: response.status,
        data: response.data,
        headers: responseHeaders,
        targetUrl,
      };
    } catch (error: any) {
      this.logger.error(`Error proxying request to ${targetUrl}: ${error.message}`);

      return {
        status: 502,
        data: {
          success: false,
          error: {
            code: 'BAD_GATEWAY',
            message: `Backend service at ${backendName} is unreachable or connection failed`,
            details: error.message,
          },
          timestamp: new Date().toISOString(),
        },
        headers: { 'content-type': 'application/json' },
        targetUrl,
      };
    } finally {
      if (selectedInstanceId) {
        await this.loadBalancerService.decrementConnections(selectedInstanceId);
      }
    }
  }

  private cleanHeaders(headers: Record<string, any>): Record<string, any> {
    const cleaned = { ...headers };
    const hopByHopHeaders = [
      'host',
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade',
      'content-length',
    ];

    for (const header of hopByHopHeaders) {
      delete cleaned[header];
      delete cleaned[header.toLowerCase()];
    }

    return cleaned;
  }

  private cleanResponseHeaders(headers: Record<string, any>): Record<string, any> {
    const cleaned = { ...headers };
    const hopByHopHeaders = [
      'connection',
      'keep-alive',
      'transfer-encoding',
      'content-encoding',
    ];

    for (const header of hopByHopHeaders) {
      delete cleaned[header];
      delete cleaned[header.toLowerCase()];
    }

    return cleaned;
  }
}
