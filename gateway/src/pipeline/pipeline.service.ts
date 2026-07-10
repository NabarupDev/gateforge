import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from './interfaces/request-context.interface';
import { ProxyResponse } from './interfaces/proxy-response.interface';
import { RequestStage } from './interfaces/request-stage.interface';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  async executePipeline(
    context: RequestContext,
    stages: RequestStage[]
  ): Promise<ProxyResponse> {
    
    const dispatch = async (i: number, ctx: RequestContext): Promise<ProxyResponse> => {
      if (i < stages.length) {
        const stage = stages[i];
        return stage.execute(ctx, (contextOverride?: RequestContext) => {
          const childContext = contextOverride || { ...ctx };
          return dispatch(i + 1, childContext);
        });
      }
      throw new Error('Pipeline finished without returning a ProxyResponse. The final stage must return a response.');
    };

    return dispatch(0, context);
  }
}
