import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { RequestStage, NextFunction } from '../interfaces/request-stage.interface';
import { RequestContext } from '../interfaces/request-context.interface';
import { ProxyResponse } from '../interfaces/proxy-response.interface';
import { CircuitBreakerService } from '../../circuit-breaker/circuit-breaker.service';

@Injectable()
export class CircuitBreakerStage implements RequestStage {
  constructor(private readonly circuitBreakerService: CircuitBreakerService) {}

  async execute(context: RequestContext, next: NextFunction): Promise<ProxyResponse> {
    const instanceId = context.instance?.id;
    
    if (!instanceId) {
      return next(); // Static routes bypass Circuit Breaker
    }

    const cbState = await this.circuitBreakerService.checkState(instanceId);
    if (cbState === 'OPEN') {
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'CIRCUIT_OPEN',
            message: `Service at ${context.instance?.host}:${context.instance?.port} is temporarily unavailable due to repeated failures.`,
          },
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE, // 503
      );
    }

    try {
      const response = await next();
      
      // 502, 503, 504 are considered node/proxy failures. We record failure to trip the CB.
      if ([502, 503, 504].includes(response.status)) {
        await this.circuitBreakerService.recordFailure(instanceId);
      } else {
        await this.circuitBreakerService.recordSuccess(instanceId);
      }
      
      return response;
    } catch (error) {
      // Network failures, timeouts
      await this.circuitBreakerService.recordFailure(instanceId);
      throw error;
    }
  }
}
