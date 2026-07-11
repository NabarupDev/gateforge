import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GatewayPlugin } from './plugin.interface';
import { RequestContext } from '../pipeline/interfaces/request-context.interface';
import { ProxyResponse } from '../pipeline/interfaces/proxy-response.interface';

@Injectable()
export class PluginManagerService implements OnModuleInit {
  private readonly logger = new Logger(PluginManagerService.name);
  private plugins: GatewayPlugin[] = [];

  onModuleInit() {
    this.logger.log(`PluginManager initialized. Loaded ${this.plugins.length} plugins.`);
  }

  /**
   * Register a new plugin at runtime or startup.
   */
  registerPlugin(plugin: GatewayPlugin) {
    if (this.plugins.find(p => p.name === plugin.name)) {
      this.logger.warn(`Plugin ${plugin.name} is already registered.`);
      return;
    }
    this.plugins.push(plugin);
    this.logger.log(`Registered plugin: ${plugin.name}`);
  }

  async executeBeforeRequest(context: RequestContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.beforeRequest) {
        try {
          await plugin.beforeRequest(context);
        } catch (e) {
          this.logger.error(`Plugin ${plugin.name} failed during beforeRequest`, e);
          throw e; // Abort pipeline
        }
      }
    }
  }

  async executeAfterResponse(context: RequestContext, response: ProxyResponse): Promise<void> {
    // Execute in reverse order for response pipeline
    for (let i = this.plugins.length - 1; i >= 0; i--) {
      const plugin = this.plugins[i];
      if (plugin.afterResponse) {
        try {
          await plugin.afterResponse(context, response);
        } catch (e) {
          this.logger.error(`Plugin ${plugin.name} failed during afterResponse`, e);
          // Typically we don't abort the response if a post-hook fails, just log it.
        }
      }
    }
  }

  async executeOnError(context: RequestContext, error: Error): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.onError) {
        try {
          await plugin.onError(context, error);
        } catch (e) {
          this.logger.error(`Plugin ${plugin.name} failed during onError`, e);
        }
      }
    }
  }
}
