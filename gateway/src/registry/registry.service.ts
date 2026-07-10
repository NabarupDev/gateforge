import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LoadBalancingStrategy } from '@gateforge/shared';

export class RegisterServiceDto {
  name!: string;
  basePath!: string;
  strategy?: LoadBalancingStrategy | string;
  enabled?: boolean;
}

export class RegisterInstanceDto {
  host!: string;
  port!: number;
  weight?: number;
  healthy?: boolean;
}

@Injectable()
export class RegistryService {
  private readonly logger = new Logger(RegistryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registerService(dto: RegisterServiceDto) {
    if (!dto.name || !dto.basePath) {
      throw new BadRequestException('Service name and basePath are required.');
    }

    const strategy = (dto.strategy as any) || 'ROUND_ROBIN';
    const enabled = dto.enabled ?? true;

    // Normalize basePath (must start with /)
    const basePath = dto.basePath.startsWith('/') ? dto.basePath : `/${dto.basePath}`;

    const service = await this.prisma.service.upsert({
      where: { name: dto.name },
      update: {
        basePath,
        strategy: strategy as any,
        enabled,
      },
      create: {
        name: dto.name,
        basePath,
        strategy: strategy as any,
        enabled,
      },
      include: { instances: true },
    });

    this.logger.log(`Registered/updated service "${service.name}" (${service.basePath}) with strategy ${service.strategy}`);
    return service;
  }

  async registerInstance(serviceIdOrName: string, dto: RegisterInstanceDto) {
    // Find service by id or name
    let service = await this.prisma.service.findUnique({ where: { id: serviceIdOrName } });
    if (!service) {
      service = await this.prisma.service.findUnique({ where: { name: serviceIdOrName } });
    }
    if (!service) {
      throw new NotFoundException(`Service "${serviceIdOrName}" not found in registry.`);
    }

    const host = dto.host;
    const port = Number(dto.port);
    const weight = dto.weight ?? 1;
    const healthy = dto.healthy ?? true;

    const existingInstance = await this.prisma.serviceInstance.findFirst({
      where: {
        serviceId: service.id,
        host,
        port,
      },
    });

    if (existingInstance) {
      const updated = await this.prisma.serviceInstance.update({
        where: { id: existingInstance.id },
        data: {
          weight,
          healthy,
        },
      });
      this.logger.log(`Updated instance ${host}:${port} for service "${service.name}"`);
      return updated;
    }

    const created = await this.prisma.serviceInstance.create({
      data: {
        serviceId: service.id,
        host,
        port,
        weight,
        healthy,
        activeConnections: 0,
      },
    });
    this.logger.log(`Registered new instance ${host}:${port} for service "${service.name}"`);
    return created;
  }

  async deregisterInstance(instanceId: string) {
    const instance = await this.prisma.serviceInstance.findUnique({ where: { id: instanceId } });
    if (!instance) {
      throw new NotFoundException(`Service instance ${instanceId} not found.`);
    }

    await this.prisma.serviceInstance.delete({ where: { id: instanceId } });
    this.logger.log(`Deregistered instance ${instance.host}:${instance.port} (${instanceId})`);
    return { success: true, id: instanceId };
  }

  async updateInstanceHealth(
    instanceId: string,
    data: {
      healthy: boolean;
      healthStatus: string;
      failureCount?: number;
      successCount?: number;
      averageLatency?: number | null;
      lastHealthCheck?: Date;
      lastHealthyAt?: Date | null;
      lastFailureAt?: Date | null;
    },
  ) {
    const instance = await this.prisma.serviceInstance.findUnique({ where: { id: instanceId } });
    if (!instance) {
      throw new NotFoundException(`Service instance ${instanceId} not found.`);
    }

    const updated = await this.prisma.serviceInstance.update({
      where: { id: instanceId },
      data: {
        healthy: data.healthy,
        healthStatus: data.healthStatus as any,
        ...(data.failureCount !== undefined && { failureCount: data.failureCount }),
        ...(data.successCount !== undefined && { successCount: data.successCount }),
        ...(data.averageLatency !== undefined && { averageLatency: data.averageLatency }),
        ...(data.lastHealthCheck && { lastHealthCheck: data.lastHealthCheck }),
        ...(data.lastHealthyAt !== undefined && { lastHealthyAt: data.lastHealthyAt }),
        ...(data.lastFailureAt !== undefined && { lastFailureAt: data.lastFailureAt }),
      },
    });
    this.logger.log(`Instance ${instance.host}:${instance.port} health updated to ${data.healthStatus} (healthy: ${data.healthy})`);
    return updated;
  }

  async findServiceByPath(urlPath: string) {
    const pathOnly = urlPath.split('?')[0];

    // Fetch all enabled services along with instances
    const services = await this.prisma.service.findMany({
      where: { enabled: true },
      include: { instances: true },
    });

    // Sort by longest basePath prefix first to match most specific route
    services.sort((a, b) => b.basePath.length - a.basePath.length);

    for (const service of services) {
      if (pathOnly === service.basePath || pathOnly.startsWith(`${service.basePath}/`)) {
        return service;
      }
    }

    return null;
  }

  async getServices() {
    return this.prisma.service.findMany({
      include: { instances: true },
      orderBy: { name: 'asc' },
    });
  }

  async getAllInstances() {
    return this.prisma.serviceInstance.findMany({
      include: { service: true },
    });
  }

  async getService(serviceIdOrName: string) {
    let service = await this.prisma.service.findUnique({
      where: { id: serviceIdOrName },
      include: { instances: true },
    });
    if (!service) {
      service = await this.prisma.service.findUnique({
        where: { name: serviceIdOrName },
        include: { instances: true },
      });
    }
    if (!service) {
      throw new NotFoundException(`Service "${serviceIdOrName}" not found.`);
    }
    return service;
  }
}
