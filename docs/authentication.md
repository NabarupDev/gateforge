# GateForge Authentication & Identity Forwarding Pattern

In production API Gateway architectures (such as Netflix Zuul, Kong, or AWS API Gateway), downstream microservices **never parse or verify JWTs directly**. GateForge implements this industry-standard **Edge Verification & Identity Injection Pattern**.

## Why Offload Authentication to the Gateway?

1. **Eliminate Redundant Cryptographic Verification**: Verifying RSA/HMAC JWT signatures on every request across 10+ downstream microservices adds massive CPU overhead and latency. GateForge verifies the token exactly once at the edge.
2. **Centralized Security Policies**: If a token is revoked or a security flaw is patched, only GateForge requires updates. Microservices remain focused purely on domain business logic (`user-service`, `order-service`).
3. **Decoupled Internal Protocols**: If external clients authenticate via OAuth2/OIDC, JWT, or API Keys, GateForge normalizes the identity into standard HTTP headers before forwarding deeper into the internal network.

## The Edge Verification Flow

```text
Client (Bearer JWT)
       │
       ▼
┌───────────────────────────────┐
│           GateForge           │
│                               │
│  1. Extract Authorization     │
│  2. Verify signature & expiry │
│  3. Check RBAC roles          │
│  4. Inject identity headers:  │
│     x-user-id: 123            │
│     x-user-email: u@test.com  │
│     x-user-role: admin        │
└──────────────┬────────────────┘
               │ (Clean HTTP Request + Identity Headers)
               ▼
┌───────────────────────────────┐
│     Downstream Service        │
│  (@gateforge/user-service)    │
│                               │
│  const userId =               │
│    req.headers['x-user-id'];  │
└───────────────────────────────┘
```

## Injected Identity Headers

When a request successfully passes `GatewayAuthGuard`, the following headers are guaranteed to be injected into `req.headers` before reaching downstream target URLs:

| Header Name | Type | Description | Example Value |
| :--- | :--- | :--- | :--- |
| `x-user-id` | string | Unique identifier (`sub` or `id` claim from JWT) | `123e4567-e89b-12d3-a456-426614174000` |
| `x-user-email` | string | User's verified email address | `engineer@gateforge.com` |
| `x-user-role` | string | User's assigned role for RBAC checks | `admin`, `user`, `superadmin` |

## Public vs. Protected vs. Role-Restricted Routes

GateForge evaluates route requirements using a combination of **NestJS Decorators** (for internal gateway endpoints) and **Dynamic Route Configuration** (`gateway.config.ts` for proxied endpoints):

1. **Public Routes (`isPublic: true` or `@Public()`)**:
   - Examples: `GET /health`, `POST /auth/token`.
   - Bypasses JWT verification completely.
2. **Protected Routes (`isPublic: false` or omitted)**:
   - Examples: `GET /users`, `GET /users/me`.
   - Requires valid `Authorization: Bearer <token>`. Throws `401 Unauthorized` if missing or expired.
3. **Role-Restricted Routes (`requiredRoles: ['admin']` or `@Roles('admin')`)**:
   - Examples: `DELETE /users/:id`.
   - Requires valid JWT AND verifies `req.user.role` is in the required roles array. Throws `403 Forbidden` if role check fails.
