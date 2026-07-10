import { RequestContext } from './request-context.interface';
import { ProxyResponse } from './proxy-response.interface';

export type NextFunction = (contextOverride?: RequestContext) => Promise<ProxyResponse>;

export interface RequestStage {
  execute(context: RequestContext, next: NextFunction): Promise<ProxyResponse>;
}
