import { Module, Global } from '@nestjs/common';
import { PluginManagerService } from './plugin.manager';

@Global()
@Module({
  providers: [PluginManagerService],
  exports: [PluginManagerService],
})
export class PluginModule {}
