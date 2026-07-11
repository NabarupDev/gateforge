import { Injectable, Logger, Inject } from '@nestjs/common';
import { RequestStage, NextFunction } from '../interfaces/request-stage.interface';
import { RequestContext } from '../interfaces/request-context.interface';
import { ProxyResponse } from '../interfaces/proxy-response.interface';
import type { InstanceSelector } from '../../instance-selector/instance-selector.interface';
import { INSTANCE_SELECTOR } from '../../instance-selector/instance-selector.interface';

@Injectable()
export class InstanceSelectionStage implements RequestStage {
  private readonly logger = new Logger(InstanceSelectionStage.name);

  constructor(@Inject(INSTANCE_SELECTOR) private readonly instanceSelector: InstanceSelector) {}

  async execute(context: RequestContext, next: NextFunction): Promise<ProxyResponse> {
    if (!context.service) {
      // It's a static route, no load balancing. targetUrl is already set.
      return next();
    }

    const instance = await this.instanceSelector.select(context);
    context.instance = instance;
    
    const urlPath = context.req.url || context.req.originalUrl || '/';
    context.targetUrl = `http://${instance.host}:${instance.port}${urlPath}`;

    const activeConnections = await this.instanceSelector.incrementConnections(instance.id);

    this.logger.log(JSON.stringify({
      event: 'INSTANCE_SELECTION',
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
      await this.instanceSelector.decrementConnections(instance.id);
    }
  }
}
