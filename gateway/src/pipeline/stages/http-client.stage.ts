import { Injectable, Logger } from '@nestjs/common';
import { RequestStage, NextFunction } from '../interfaces/request-stage.interface';
import { RequestContext } from '../interfaces/request-context.interface';
import { ProxyResponse } from '../interfaces/proxy-response.interface';
import { trace, context as otelContext } from '@opentelemetry/api';

@Injectable()
export class HttpClientStage implements RequestStage {
  private readonly logger = new Logger(HttpClientStage.name);

  async execute(context: RequestContext, next: NextFunction): Promise<ProxyResponse> {
    const targetUrl = context.targetUrl;
    const req = context.req;
    const abortSignal = context.abortSignal;

    if (!targetUrl) {
      throw new Error('HttpClientStage: targetUrl is missing from context');
    }

    const method = (req.method || 'GET').toUpperCase();
    const data = req.body;
    
    const headers: Record<string, string> = {};
    if (req.headers) {
      Object.entries(req.headers).forEach(([key, value]) => {
        if (!['host', 'connection'].includes(key.toLowerCase()) && value) {
          headers[key] = Array.isArray(value) ? value.join(',') : value as string;
        }
      });
    }

    const reqId = (req as any).requestId || headers['x-request-id'];
    if (reqId) {
      headers['x-request-id'] = reqId;
    }

    const span = trace.getSpan(otelContext.active());
    if (span) {
      const spanContext = span.spanContext();
      headers['traceparent'] = `00-${spanContext.traceId}-${spanContext.spanId}-01`;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: abortSignal,
    };

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && data && Object.keys(data).length > 0) {
      if (Buffer.isBuffer(data) || typeof data === 'string') {
        fetchOptions.body = data as any;
      } else {
        fetchOptions.body = JSON.stringify(data);
        (fetchOptions.headers as Record<string, string>)['content-type'] = 'application/json';
      }
    }

    try {
      const tStart = performance.now();
      this.logger.log(`[HttpClient] Sending fetch request to ${targetUrl} (method: ${method})`);
      
      const response = await fetch(targetUrl, fetchOptions);
      
      this.logger.log(`[HttpClient] Received fetch response from ${targetUrl} in ${performance.now() - tStart}ms`);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      const buffer = await response.arrayBuffer();

      return {
        status: response.status,
        data: Buffer.from(buffer),
        headers: this.cleanResponseHeaders(responseHeaders),
        targetUrl,
      };
    } catch (error: any) {
      this.logger.error(`[HttpClient] Error fetching ${targetUrl}: ${error.message}`);
      if (abortSignal?.aborted && abortSignal.reason) {
        throw abortSignal.reason;
      }
      this.logger.error(`Error proxying request to ${targetUrl}: ${error.message}`);
      
      // Pass the raw error up to the pipeline (CircuitBreaker and Retry will catch it)
      throw error;
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
      'content-length', // Let Axios calculate it
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
      'content-encoding', // Useful to clean if proxy automatically decompresses
    ];

    for (const header of hopByHopHeaders) {
      delete cleaned[header];
      delete cleaned[header.toLowerCase()];
    }

    return cleaned;
  }
}
