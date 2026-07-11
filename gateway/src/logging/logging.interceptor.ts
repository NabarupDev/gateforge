import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';
import { trace } from '@opentelemetry/api';
import { Counter, Histogram } from 'prom-client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import {
  GATEFORGE_REQUESTS_TOTAL,
  GATEFORGE_REQUEST_DURATION,
} from '../telemetry/telemetry.module';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric(GATEFORGE_REQUESTS_TOTAL) private readonly requestsTotal: Counter<string>,
    @InjectMetric(GATEFORGE_REQUEST_DURATION) private readonly requestDuration: Histogram<string>
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest();
    const res = httpContext.getResponse();
    const now = Date.now();

    // Ensure Request ID exists early
    const existingId =
      req.requestId ||
      (req.headers && (req.headers['x-request-id'] || req.headers['X-Request-ID'])) ||
      (req.raw && req.raw.headers && (req.raw.headers['x-request-id'] || req.raw.headers['X-Request-ID']));
    const requestId = typeof existingId === 'string' && existingId.trim() ? existingId : randomUUID();

    req.requestId = requestId;
    if (req.raw) req.raw.requestId = requestId;
    if (!req.headers) req.headers = {};
    req.headers['x-request-id'] = requestId;
    req.headers['X-Request-ID'] = requestId;

    if (res && typeof res.header === 'function') {
      res.header('X-Request-ID', requestId);
    } else if (res && typeof res.setHeader === 'function') {
      res.setHeader('X-Request-ID', requestId);
    } else if (res && res.raw && typeof res.raw.setHeader === 'function') {
      res.raw.setHeader('X-Request-ID', requestId);
    }

    return next.handle().pipe(
      tap({
        next: () => {
          this.logRequest(httpContext, now, req);
        },
        error: () => {
          this.logRequest(httpContext, now, req);
        },
      }),
    );
  }

  private logRequest(httpContext: any, startTime: number, req: any) {
    const res = httpContext.getResponse();
    const method = req.method || 'GET';
    const path = req.url || req.originalUrl || '/';
    const target = req.targetUrl || 'internal';
    const time = `${Date.now() - startTime}ms`;

    const requestId =
      req.requestId ||
      (req.headers && (req.headers['x-request-id'] || req.headers['X-Request-ID'])) ||
      'unknown';
    const authType = req.auth?.type ? req.auth.type.toUpperCase() : 'NONE';
    const principalId =
      req.auth?.consumerId ||
      req.auth?.userId ||
      req.user?.id ||
      req.user?.sub ||
      'anonymous';
    const role = req.auth?.role || req.user?.role || 'none';

    let status = 200;
    if (typeof res.statusCode === 'number') {
      status = res.statusCode;
    } else if (res.raw && typeof res.raw.statusCode === 'number') {
      status = res.raw.statusCode;
    } else if (res.status && typeof res.status === 'number') {
      status = res.status;
    }

    const activeSpan = trace.getActiveSpan();
    const traceId = activeSpan ? activeSpan.spanContext().traceId : (req.headers['traceparent']?.split('-')[1] || req.headers['x-b3-traceid'] || 'unknown');

    const latency = Date.now() - startTime;
    const logObject = {
      timestamp: new Date(startTime).toISOString(),
      traceId: traceId,
      requestId: requestId,
      service: req.raw?.targetService || 'gateway',
      instance: req.raw?.targetInstance || 'gateway',
      latency: latency,
      cache: res.getHeader?.('x-cache') || 'MISS',
      retry: req.raw?.retryCount || 0,
      status: status,
      method: method,
      path: path
    };

    // Use Pino or simple JSON stringify. We use JSON stringify for the exact clean format.
    console.log(JSON.stringify(logObject));

    // Record Metrics
    const serviceName = req.raw?.targetService || 'gateway';
    this.requestsTotal.labels(method, status.toString(), serviceName).inc();
    this.requestDuration.labels(method, status.toString(), serviceName).observe(latency / 1000); // observe seconds
  }
}
