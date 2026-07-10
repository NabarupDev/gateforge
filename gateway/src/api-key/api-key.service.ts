import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as crypto from 'crypto';

export interface CreateApiKeyResponse {
  id: string;
  key: string;
  prefix: string;
  consumerId: string;
}

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async createConsumer(name: string, description?: string) {
    if (!name) {
      throw new BadRequestException('Consumer name is required');
    }
    return this.prisma.apiConsumer.create({
      data: {
        name,
        description: description || null,
      },
    });
  }

  async listConsumers() {
    return this.prisma.apiConsumer.findMany({
      include: {
        apiKeys: {
          select: {
            id: true,
            name: true,
            prefix: true,
            revoked: true,
            expiresAt: true,
            lastUsedAt: true,
            usageCount: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async generateApiKey(
    consumerIdOrName: string,
    keyName: string,
    prefixType: string = 'gf_live',
    expiresAt?: Date | string,
  ): Promise<CreateApiKeyResponse> {
    if (!consumerIdOrName || !keyName) {
      throw new BadRequestException('consumerIdOrName and keyName are required');
    }

    // Try to find consumer by ID or Name, or auto-create if ID is a name
    let consumer = await this.prisma.apiConsumer.findUnique({
      where: { id: consumerIdOrName },
    }).catch(() => null);

    if (!consumer) {
      consumer = await this.prisma.apiConsumer.findFirst({
        where: { name: consumerIdOrName },
      });
    }

    if (!consumer) {
      consumer = await this.createConsumer(consumerIdOrName);
    }

    const secret = crypto.randomBytes(32).toString('hex');
    const cleanPrefix = prefixType.endsWith('_') ? prefixType : `${prefixType}_`;
    const fullKey = `${cleanPrefix}${secret}`;
    const prefix = fullKey.slice(0, 16);
    const hashedKey = crypto.createHash('sha256').update(fullKey).digest('hex');

    let parsedExpiresAt: Date | null = null;
    if (expiresAt) {
      parsedExpiresAt = new Date(expiresAt);
    }

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name: keyName,
        prefix,
        hashedKey,
        consumerId: consumer.id,
        expiresAt: parsedExpiresAt,
      },
    });

    return {
      id: apiKey.id,
      key: fullKey,
      prefix,
      consumerId: consumer.id,
    };
  }

  async revokeApiKey(keyIdOrPrefix: string) {
    let apiKey = await this.prisma.apiKey.findUnique({
      where: { id: keyIdOrPrefix },
    }).catch(() => null);

    if (!apiKey) {
      apiKey = await this.prisma.apiKey.findFirst({
        where: { prefix: keyIdOrPrefix },
      });
    }

    if (!apiKey) {
      throw new NotFoundException(`API key not found: ${keyIdOrPrefix}`);
    }

    const updated = await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { revoked: true },
    });

    return { success: true, id: updated.id, revoked: updated.revoked };
  }
}
