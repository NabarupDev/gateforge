import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { RouteConfig } from '../config/gateway.config';

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
  ) {}

  async forwardRequest(req: any): Promise<ProxyResponse> {
    const routes = this.configService.get<RouteConfig[]>('gateway.routes') || [];
    const urlPath = req.url || req.originalUrl || '/';
    const pathOnly = urlPath.split('?')[0];

    // Find matching route by prefix
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

    const targetUrl = `${matchedRoute.target}${urlPath}`;

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
            message: `Backend service at ${matchedRoute.target} is unreachable or connection failed`,
            details: error.message,
          },
          timestamp: new Date().toISOString(),
        },
        headers: { 'content-type': 'application/json' },
        targetUrl,
      };
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
