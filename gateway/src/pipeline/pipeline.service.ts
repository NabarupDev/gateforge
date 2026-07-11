import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from './interfaces/request-context.interface';
import { ProxyResponse } from './interfaces/proxy-response.interface';
import { RequestStage } from './interfaces/request-stage.interface';
import { trace } from '@opentelemetry/api';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  async executePipeline(
    context: RequestContext,
    stages: RequestStage[]
  ): Promise<ProxyResponse> {
    const tracer = trace.getTracer('gateforge-pipeline');

    const dispatch = async (i: number, ctx: RequestContext): Promise<ProxyResponse> => {
      if (i < stages.length) {
        const stage = stages[i];
        const spanName = stage.constructor.name;
        
        return tracer.startActiveSpan(spanName, async (span) => {
          try {
            const result = await stage.execute(ctx, (contextOverride?: RequestContext) => {
              const childContext = contextOverride || { ...ctx };
              return dispatch(i + 1, childContext);
            });
            return result;
          } catch (error: any) {
            span.recordException(error);
            throw error;
          } finally {
            span.end();
          }
        });
      }
      throw new Error('Pipeline finished without returning a ProxyResponse. The final stage must return a response.');
    };

    return dispatch(0, context);
  }
}
