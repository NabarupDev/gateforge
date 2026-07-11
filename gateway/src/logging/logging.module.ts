import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { trace, context } from '@opentelemetry/api';
import { randomUUID } from 'crypto';
import { LoggingInterceptor } from './logging.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: false, // We'll manually log the exact format the user wants via an Interceptor, OR configure pinoHttp to auto-log it. Let's auto-log!
        formatters: {
          level: (label) => {
            return { level: label };
          },
        },
        customSuccessMessage: function (req, res) {
          return 'Request Completed';
        },
        customProps: function (req: any, res: any) {
          const span = trace.getSpan(context.active());
          const traceId = span ? span.spanContext().traceId : undefined;
          const requestId =
            req.requestId ||
            (req.headers && (req.headers['x-request-id'] || req.headers['X-Request-ID'])) ||
            randomUUID();

          return {
            traceId,
            requestId,
            service: req.raw?.targetService || 'gateway',
            instance: req.raw?.targetInstance || 'gateway',
            cache: res.getHeader?.('x-cache') || 'MISS',
            retry: req.raw?.retryCount || 0,
            latency: res.responseTime,
            status: res.statusCode,
          };
        },
      },
    }),
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class LoggingModule {}
