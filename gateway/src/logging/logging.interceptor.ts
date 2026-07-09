import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest();
    const now = Date.now();

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
    
    // Extract status code whether Fastify or Express
    let status = 200;
    if (typeof res.statusCode === 'number') {
      status = res.statusCode;
    } else if (res.raw && typeof res.raw.statusCode === 'number') {
      status = res.raw.statusCode;
    } else if (res.status && typeof res.status === 'number') {
      status = res.status;
    }

    console.log('\nIncoming Request\n');
    console.log(`Method : ${method}`);
    console.log(`Path   : ${path}`);
    console.log(`Target : ${target}`);
    console.log(`Time   : ${time}`);
    console.log(`Status : ${status}`);
  }
}
