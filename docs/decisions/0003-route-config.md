# ADR 0003: Static Configuration File Routing vs. Database-Backed Routing

## Status
Accepted (Phase 1 & Phase 2) — Scheduled for evolution in v0.6 (Database Routing)

## Context
An API Gateway must maintain a routing table mapping incoming URL path prefixes (`/users`) to target microservice host/port definitions (`http://localhost:3001`). We evaluated two storage mechanisms for this routing table:
1. Static configuration files loaded on application bootstrap (`gateway.config.ts` / `.env`).
2. Dynamic relational database tables (`PostgreSQL`) queried/cached at runtime.

## Decision
We decided to use **Static Configuration (`gateway.config.ts`) via `@nestjs/config`** for Phases 1 and 2, while architecting the routing structures (`RouteConfig` interface) specifically so they can be swapped for a database-backed provider (`Prisma` + `PostgreSQL`) in Phase 3/v0.6 without modifying the core `ProxyService` matching engine.

## Rationale
1. **Zero External Infrastructure Dependency for Core Validation**: During early phases, requiring a running PostgreSQL instance and populated tables just to verify routing logic and JWT header injection increases setup friction and test complexity.
2. **Predictable Bootstrapping**: A TypeScript configuration file allows strict compile-time checking of route object properties (`isPublic`, `requiredRoles`, `target`).
3. **Clean Abstraction**: `ProxyService` requests the route array via `this.configService.get<RouteConfig[]>('gateway.routes')`. When migrating to database routing, we simply replace this provider with `this.routeTableCache.getRoutes()`.

## Evolution to Database-Backed Routing (v0.6+)
In future iterations:
- Route definitions will reside in the `services` table in PostgreSQL (using Prisma ORM).
- An **Admin Dashboard** will allow live addition, deletion, and toggling (`enabled: false`) of microservice routes.
- To prevent database latency from impacting every API call, routes loaded from PostgreSQL will be cached inside Redis (`RouteTable`) and refreshed via Pub/Sub events when an admin modifies a route.
