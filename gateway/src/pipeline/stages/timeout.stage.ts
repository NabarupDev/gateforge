import { Injectable } from '@nestjs/common';
import { RequestStage, NextFunction } from '../interfaces/request-stage.interface';
import { RequestContext } from '../interfaces/request-context.interface';
import { ProxyResponse } from '../interfaces/proxy-response.interface';

@Injectable()
export class TimeoutStage implements RequestStage {
  async execute(context: RequestContext, next: NextFunction): Promise<ProxyResponse> {
    const timeoutMs = context.service?.timeoutMs ?? 3000;
    
    const timeoutAc = new AbortController();
    const parentSignal = context.abortSignal;

    if (parentSignal) {
      if (parentSignal.aborted) {
        throw parentSignal.reason || new Error('Aborted');
      }
      parentSignal.addEventListener('abort', () => {
        timeoutAc.abort(parentSignal.reason);
      });
    }

    const timerId = setTimeout(() => {
      const error = new Error(`Request timed out after ${timeoutMs}ms`);
      error.name = 'TimeoutError';
      (error as any).code = 'ETIMEDOUT';
      timeoutAc.abort(error);
    }, timeoutMs);

    // Provide the new abort signal to downstream stages
    const childContext = { ...context, abortSignal: timeoutAc.signal };

    try {
      const response = await next(childContext);
      return response;
    } catch (error: any) {
      // If the error was caused by our timeout abort
      if (timeoutAc.signal.aborted && timeoutAc.signal.reason?.name === 'TimeoutError') {
        throw timeoutAc.signal.reason;
      }
      throw error;
    } finally {
      clearTimeout(timerId);
    }
  }
}
