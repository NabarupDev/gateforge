import { Controller, Post, Get, Patch, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { RegistryService, RegisterServiceDto, RegisterInstanceDto } from './registry.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('gateway')
export class RegistryController {
  constructor(private readonly registryService: RegistryService) {}

  @Public()
  @Post('services')
  async registerService(@Body() dto: RegisterServiceDto) {
    return this.registryService.registerService(dto);
  }

  @Public()
  @Get('services')
  async getServices() {
    return this.registryService.getServices();
  }

  @Public()
  @Get('services/:id')
  async getService(@Param('id') id: string) {
    return this.registryService.getService(id);
  }

  @Public()
  @Post('services/:serviceId/instances')
  async registerInstance(@Param('serviceId') serviceId: string, @Body() dto: RegisterInstanceDto) {
    return this.registryService.registerInstance(serviceId, dto);
  }

  @Public()
  @Delete('instances/:id')
  @HttpCode(HttpStatus.OK)
  async deregisterInstance(@Param('id') id: string) {
    return this.registryService.deregisterInstance(id);
  }

  @Public()
  @Patch('instances/:id/health')
  @HttpCode(HttpStatus.OK)
  async updateInstanceHealth(@Param('id') id: string, @Body() body: { healthy: boolean }) {
    return this.registryService.updateInstanceHealth(id, {
      healthy: body.healthy,
      healthStatus: body.healthy ? 'HEALTHY' : 'UNHEALTHY',
    });
  }
}
