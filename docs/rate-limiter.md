# GateForge Distributed Rate Limiting Specification (v0.5 Roadmap)

To protect downstream microservices from denial-of-service (DoS) attacks, brute-force attempts, and resource exhaustion, GateForge will implement **Distributed Rate Limiting** using `@nestjs/throttler` backed by **Redis**.

## Why Not In-Memory Rate Limiting?

While simple node-level `Map` or memory limiters work for single-instance gateways, production deployments run multiple horizontal gateway replicas behind a cloud load balancer (e.g., AWS ALB / Kubernetes Ingress). In-memory limiters fail horizontally because each replica maintains its own counter.

```text
               ┌──► Gateway Replica 1 (req count: 3)
Client ───────►│
(10 req/s)     └──► Gateway Replica 2 (req count: 7)
               
       ▲ All replicas check central Redis store (Total count: 10)
```

## Architectural Design

1. **Storage Engine**: `redis:7-alpine` container (already running via `docker-compose.yml` on port `6379`).
2. **NestJS Throttler Redis Storage**: `@nest-lab/throttler-storage-redis` or custom `ioredis` storage adapter.
3. **Multi-Tier Limiting Strategy**:
   - **Global IP Limiter**: `100 requests per minute per IP address` (prevents DDoS).
   - **Authenticated User Limiter**: `1000 requests per minute per x-user-id` (prevents bad actors).
   - **Sensitive Route Limiter**: `5 requests per minute` on authentication / token issuance endpoints (`POST /auth/*`).

## Standard HTTP Response Headers

When rate limits are evaluated, GateForge will return standard RFC-compliant headers:
- `X-RateLimit-Limit`: Maximum requests allowed in the current time window.
- `X-RateLimit-Remaining`: Requests remaining in the current time window.
- `X-RateLimit-Reset`: Timestamp when the rate limit window resets.
- **When Exceeded (429 Too Many Requests)**:
  ```json
  {
    "success": false,
    "error": {
      "code": "TOO_MANY_REQUESTS",
      "message": "Rate limit exceeded. Try again in 45 seconds."
    },
    "timestamp": "2026-07-10T10:00:00.000Z"
  }
  ```
