import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
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

    console.log('\nIncoming Request\n');
    console.log(`Request ID : ${requestId}`);
    console.log(`Auth Type  : ${authType}`);
    console.log(`Principal  : ${principalId}`);
    console.log(`Role       : ${role}`);
    console.log(`Method     : ${method}`);
    console.log(`Path       : ${path}`);
    console.log(`Target     : ${target}`);
    console.log(`Status     : ${status}`);
    console.log(`Time       : ${time}`);
  }
}
