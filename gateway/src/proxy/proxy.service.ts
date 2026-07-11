import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '../pipeline/interfaces/request-context.interface';
import { ProxyResponse } from '../pipeline/interfaces/proxy-response.interface';
import { PipelineService } from '../pipeline/pipeline.service';
import { ServiceDiscoveryStage } from '../pipeline/stages/service-discovery.stage';
import { CacheStage } from '../pipeline/stages/cache.stage';
import { RetryStage } from '../pipeline/stages/retry.stage';
import { HedgingStage } from '../pipeline/stages/hedging.stage';
import { InstanceSelectionStage } from '../pipeline/stages/instance-selection.stage';
import { CircuitBreakerStage } from '../pipeline/stages/circuit-breaker.stage';
import { TimeoutStage } from '../pipeline/stages/timeout.stage';
import { HttpClientStage } from '../pipeline/stages/http-client.stage';
import { PluginManagerService } from '../plugins/plugin.manager';

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private readonly pipelineService: PipelineService,
    private readonly serviceDiscoveryStage: ServiceDiscoveryStage,
    private readonly cacheStage: CacheStage,
    private readonly retryStage: RetryStage,
    private readonly hedgingStage: HedgingStage,
    private readonly instanceSelectionStage: InstanceSelectionStage,
    private readonly circuitBreakerStage: CircuitBreakerStage,
    private readonly timeoutStage: TimeoutStage,
    private readonly httpClientStage: HttpClientStage,
    private readonly pluginManager: PluginManagerService,
  ) {}

  async forwardRequest(req: any): Promise<ProxyResponse> {
    const context: RequestContext = {
      req,
      attempt: 0,
    };

    const stages = [
      this.serviceDiscoveryStage,
      this.cacheStage,
      this.retryStage,
      this.hedgingStage,
      this.instanceSelectionStage,
      this.circuitBreakerStage,
      this.timeoutStage,
      this.httpClientStage,
    ];

    try {
      // 1. Plugin Hook: beforeRequest
      await this.pluginManager.executeBeforeRequest(context);

      // 2. Execute Pipeline
      const response = await this.pipelineService.executePipeline(context, stages);

      // 3. Plugin Hook: afterResponse
      await this.pluginManager.executeAfterResponse(context, response);

      return response;
    } catch (error: any) {
      // Plugin Hook: onError
      await this.pluginManager.executeOnError(context, error);

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
