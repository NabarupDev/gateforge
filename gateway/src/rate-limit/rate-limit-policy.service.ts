import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitPolicy } from './interfaces/rate-limit-policy.interface';
import { DEFAULT_ANONYMOUS_POLICY } from './policies/default.policy';
import { JWT_USER_POLICY } from './policies/jwt.policy';
import { API_KEY_POLICY } from './policies/api-key.policy';
import { ADMIN_POLICY } from './policies/admin.policy';
import { RATE_LIMIT_KEY } from './decorators/rate-limit.decorator';

export interface PolicyResolution {
  key: string;
  policy: RateLimitPolicy;
  principalName: string;
}

@Injectable()
export class RateLimitPolicyService {
  constructor(private readonly reflector: Reflector) {}

  resolvePolicy(context: ExecutionContext): PolicyResolution {
    const request = context.switchToHttp().getRequest();
    const auth = request.auth || request.user || (request.raw && (request.raw.auth || request.raw.user));

    let basePolicy: RateLimitPolicy;
    let baseKey: string;
    let principalName: string;

    if (auth && auth.role === 'admin') {
      basePolicy = ADMIN_POLICY;
      baseKey = `rl:admin:${auth.userId || auth.consumerId || auth.id || 'admin'}`;
      principalName = String(auth.userId || auth.consumerId || auth.id || 'admin');
    } else if (auth && auth.type === 'jwt') {
      basePolicy = JWT_USER_POLICY;
      const userId = String(auth.userId || auth.id || 'unknown');
      baseKey = `rl:user:${userId}`;
      principalName = userId;
    } else if (auth && auth.type === 'api-key') {
      basePolicy = API_KEY_POLICY;
      const keyOrConsumer = String(auth.keyId || auth.consumerId || auth.id || 'unknown');
      baseKey = `rl:apikey:${keyOrConsumer}`;
      principalName = keyOrConsumer;
    } else {
      basePolicy = DEFAULT_ANONYMOUS_POLICY;
      const ip =
        request.ip ||
        request.headers?.['x-forwarded-for'] ||
        request.socket?.remoteAddress ||
        (request.raw && (request.raw.ip || request.raw.socket?.remoteAddress)) ||
        '127.0.0.1';
      baseKey = `rl:ip:${ip}`;
      principalName = String(ip);
    }

    // Check if route or class has a custom @RateLimit() override
    const override = this.reflector.getAllAndOverride<Partial<RateLimitPolicy>>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (override) {
      // Admin bypasses even strict route overrides unless explicitly un-admined
      if (basePolicy.unlimited) {
        return {
          key: baseKey,
          policy: basePolicy,
          principalName,
        };
      }

      const pathOnly = (request.url || request.originalUrl || '/').split('?')[0];
      return {
        key: `${baseKey}:route:${pathOnly}`,
        policy: {
          name: `${basePolicy.name}:override`,
          requests: override.requests !== undefined ? override.requests : basePolicy.requests,
          window: override.window !== undefined ? override.window : basePolicy.window,
          unlimited: override.unlimited !== undefined ? override.unlimited : basePolicy.unlimited,
        },
        principalName,
      };
    }

    return {
      key: baseKey,
      policy: basePolicy,
      principalName,
    };
  }
}
