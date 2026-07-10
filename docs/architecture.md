# GateForge Architecture & Request Lifecycle

GateForge is an enterprise-grade API Gateway built with **NestJS** and **Fastify**, orchestrating specialized downstream microservices in a unified **pnpm monorepo**.

## Core Architectural Principles

1. **Centralized Edge Security**: All external requests pass through GateForge (`Port 3000`). Downstream microservices (`user-service`, `order-service`, `ai-service`) are insulated in private networks or localhost ports and never expose direct external endpoints.
2. **Authentication Offloading**: GateForge validates JWTs and enforces Role-Based Access Control (RBAC) at the edge. Downstream services receive trusted user context headers (`x-user-id`, `x-user-email`, `x-user-role`) and never verify JWT cryptographic signatures directly.
3. **End-to-End Type Safety**: Through `@gateforge/shared` workspace packages, exact DTOs, API responses, and enums (`ServiceName`) are shared across the gateway and all microservices without external npm publishing.

## System Architecture Diagram

```text
                 External Client
                        │
                        ▼  HTTP Request (Authorization: Bearer <token>)
            ┌───────────────────────┐
            │       GateForge       │  (Port 3000)
            │      API Gateway      │
            └───────────┬───────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
 [Internal Controllers]          [Proxy Controller]
 ──► GET /health                 ──► All /* wildcard paths
 ──► POST /auth/token                    │
                                         ▼
                               [GatewayAuthGuard]
                               ──► Verify JWT signature
                               ──► Enforce RBAC roles
                               ──► Inject x-user-* headers
                                         │
                                         ▼
                                 [ProxyService]
                               ──► Match route prefix
                               ──► Strip hop-by-hop headers
                               ──► Forward request (Axios/Stream)
                                         │
                        ┌────────────────┴────────────────┐
                        ▼                                 ▼
              ┌───────────────────┐             ┌───────────────────┐
              │   User Service    │             │   Order Service   │
              │  (Express/Port    │             │   (NestJS/Port    │
              │      3001)        │             │      3002)        │
              └───────────────────┘             └───────────────────┘
```

## Request Lifecycle

1. **Ingress**: Request enters the Fastify HTTP engine on Port 3000.
2. **Logging Interceptor (Request Start)**: Captures request start time, method, path, and target URL.
3. **GatewayAuthGuard**:
   - Checks if route or path prefix is public (`@Public()` decorator or `gateway.config.ts`).
   - If protected, validates JWT bearer token against `JWT_SECRET`.
   - Checks required roles against decoded token claims (`req.user.role`).
   - Injects HTTP request headers: `x-user-id`, `x-user-email`, `x-user-role`.
4. **ProxyController / Route Handler**:
   - For internal routes (`/health`, `/auth/token`), handles directly and returns JSON.
   - For proxied routes (`/users/*`), invokes `ProxyService.forwardRequest()`.
5. **ProxyService**:
   - Matches path prefix against target backend (`http://localhost:3001`).
   - Cleans hop-by-hop headers (`host`, `connection`, etc.).
   - Sends request with injected identity headers to target downstream service.
   - Catches connection failures and returns clean `502 Bad Gateway` JSON response.
6. **Logging Interceptor (Response End)**: Logs latency (`ms`) and response status code to terminal.
