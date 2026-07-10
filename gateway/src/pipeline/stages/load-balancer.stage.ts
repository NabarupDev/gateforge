import { Injectable, Logger } from '@nestjs/common';
import { RequestStage, NextFunction } from '../interfaces/request-stage.interface';
import { RequestContext } from '../interfaces/request-context.interface';
import { ProxyResponse } from '../interfaces/proxy-response.interface';
import { LoadBalancerService } from '../../load-balancer/load-balancer.service';

@Injectable()
export class LoadBalancerStage implements RequestStage {
  private readonly logger = new Logger(LoadBalancerStage.name);

  constructor(private readonly loadBalancerService: LoadBalancerService) {}

  async execute(context: RequestContext, next: NextFunction): Promise<ProxyResponse> {
    if (!context.service) {
      // It's a static route, no load balancing. targetUrl is already set.
      return next();
    }

    const instance = await this.loadBalancerService.selectInstance(context.service);
    context.instance = instance;
    
    const urlPath = context.req.url || context.req.originalUrl || '/';
    context.targetUrl = `http://${instance.host}:${instance.port}${urlPath}`;

    const activeConnections = await this.loadBalancerService.incrementConnections(instance.id);

    this.logger.log(JSON.stringify({
      event: 'LOAD_BALANCER_ROUTING',
      requestId: context.req.headers?.['x-request-id'] || 'unknown',
      service: context.service.name,
      strategy: context.service.strategy,
      selectedInstance: `${instance.host}:${instance.port}`,
      instanceId: instance.id,
      activeConnections,
    }));

    try {
      return await next();
    } finally {
      await this.loadBalancerService.decrementConnections(instance.id);
    }
  }
}
