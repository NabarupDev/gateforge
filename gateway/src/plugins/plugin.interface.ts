import { RequestContext } from '../pipeline/interfaces/request-context.interface';
import { ProxyResponse } from '../pipeline/interfaces/proxy-response.interface';

export interface GatewayPlugin {
  /**
   * Unique name of the plugin
   */
  name: string;

  /**
   * Executed before the request enters the pipeline.
   * Can be used for custom authentication, rate limiting, or request modification.
   * If this throws an error, the pipeline is aborted.
   */
  beforeRequest?(context: RequestContext): Promise<void>;

  /**
   * Executed after the pipeline generates a response, but before it is sent to the client.
   * Can be used to inject custom headers, compress payload, or log analytics.
   * The response object can be mutated directly.
   */
  afterResponse?(context: RequestContext, response: ProxyResponse): Promise<void>;

  /**
   * Executed if an error is thrown anywhere in the pipeline or beforeRequest hooks.
   * Can be used for custom error reporting or modifying the error response.
   */
  onError?(context: RequestContext, error: Error): Promise<void>;
}
