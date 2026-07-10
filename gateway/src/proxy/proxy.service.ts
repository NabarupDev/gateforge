import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '../pipeline/interfaces/request-context.interface';
import { ProxyResponse } from '../pipeline/interfaces/proxy-response.interface';
import { PipelineService } from '../pipeline/pipeline.service';
import { ServiceDiscoveryStage } from '../pipeline/stages/service-discovery.stage';
import { RetryStage } from '../pipeline/stages/retry.stage';
import { HedgingStage } from '../pipeline/stages/hedging.stage';
import { LoadBalancerStage } from '../pipeline/stages/load-balancer.stage';
import { CircuitBreakerStage } from '../pipeline/stages/circuit-breaker.stage';
import { TimeoutStage } from '../pipeline/stages/timeout.stage';
import { HttpClientStage } from '../pipeline/stages/http-client.stage';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private readonly pipelineService: PipelineService,
    private readonly serviceDiscoveryStage: ServiceDiscoveryStage,
    private readonly retryStage: RetryStage,
    private readonly hedgingStage: HedgingStage,
    private readonly loadBalancerStage: LoadBalancerStage,
    private readonly circuitBreakerStage: CircuitBreakerStage,
    private readonly timeoutStage: TimeoutStage,
    private readonly httpClientStage: HttpClientStage,
  ) {}

  async forwardRequest(req: any): Promise<ProxyResponse> {
    const context: RequestContext = {
      req,
      attempt: 0,
    };

    const stages = [
      this.serviceDiscoveryStage,
      this.retryStage,
      this.hedgingStage,
      this.loadBalancerStage,
      this.circuitBreakerStage,
      this.timeoutStage,
      this.httpClientStage,
    ];

    try {
      return await this.pipelineService.executePipeline(context, stages);
    } catch (error: any) {
      // If an HttpException (like 503 from CircuitBreaker or 404 from StaticRoutes) bubbles up,
      // we should rethrow it so the global exception filter handles it, or just return it?
      // Wait, original ProxyService threw HttpException for 404 and 503 (CircuitBreaker).
      // Let's rethrow it if it has a status property (meaning it's an HttpException).
      if (error.status && error.response) {
        throw error; 
      }

      const backendName = context.service?.name 
        ? `${context.service.name} (${context.instance?.host}:${context.instance?.port})`
        : 'StaticBackend';

      this.logger.error(`Error proxying request: ${error.message}`, error.stack);

      return {
        status: error.name === 'TimeoutError' ? 504 : 502,
        data: {
          success: false,
          error: {
            code: error.name === 'TimeoutError' ? 'GATEWAY_TIMEOUT' : 'BAD_GATEWAY',
            message: `Backend service at ${backendName} is unreachable or connection failed`,
            details: error.message,
          },
          timestamp: new Date().toISOString(),
        },
        headers: { 'content-type': 'application/json' },
        targetUrl: context.targetUrl || '',
      };
    }
  }
}
