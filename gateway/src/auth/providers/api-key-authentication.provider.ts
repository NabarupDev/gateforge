import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthenticationProvider } from '../interfaces/authentication-provider.interface';
import { AuthenticatedPrincipal } from '@gateforge/shared';
import { PrismaService } from '../../database/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyAuthenticationProvider implements AuthenticationProvider {
  constructor(private readonly prisma: PrismaService) {}

  canAuthenticate(request: any): boolean {
    const apiKey = request.headers?.['x-api-key'] || request.headers?.['X-API-KEY'];
    return typeof apiKey === 'string' && apiKey.trim().length > 0;
  }

  async authenticate(request: any): Promise<AuthenticatedPrincipal | null> {
    const apiKey = request.headers?.['x-api-key'] || request.headers?.['X-API-KEY'];
    if (!apiKey || typeof apiKey !== 'string') {
      return null;
    }

    const rawKey = apiKey.trim();
    const prefix = rawKey.slice(0, 16);
    const hashedInput = crypto.createHash('sha256').update(rawKey).digest('hex');

    const candidates = await this.prisma.apiKey.findMany({
      where: { prefix },
      include: { consumer: true },
    });

    let matchingKey: any = null;
    for (const candidate of candidates) {
      if (candidate.hashedKey.length === hashedInput.length) {
        const inputBuffer = Buffer.from(hashedInput, 'hex');
        const storedBuffer = Buffer.from(candidate.hashedKey, 'hex');
        if (crypto.timingSafeEqual(inputBuffer, storedBuffer)) {
          matchingKey = candidate;
          break;
        }
      }
    }

    if (!matchingKey) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (matchingKey.revoked) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (matchingKey.expiresAt && new Date(matchingKey.expiresAt) < new Date()) {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Increment usage counter and update lastUsedAt
    await this.prisma.apiKey.update({
      where: { id: matchingKey.id },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    }).catch(() => null);

    return {
      type: 'api-key',
      id: matchingKey.consumerId,
      consumerId: matchingKey.consumerId,
      keyId: matchingKey.id,
      role: 'consumer',
      scopes: [],
    };
  }
}
