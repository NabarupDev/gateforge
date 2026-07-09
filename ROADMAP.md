# GateForge Architectural Roadmap

This roadmap outlines the evolution of the GateForge platform from foundational monorepo setup to full microservice orchestration and cloud deployment.

## Phase 1: Monorepo & Infrastructure Foundation (Current)
- [x] Restructure repository into a unified `pnpm` monorepo workspace.
- [x] Centralize local infrastructure (`docker-compose.yml` for PostgreSQL 16, Redis 7, pgAdmin).
- [x] Establish `@gateforge/shared` workspace package for shared DTOs, interfaces, and error definitions.
- [x] Initialize backend service boundaries (`user-service`, `order-service`, `ai-service`).

## Phase 2: API Gateway Core Features (`@gateforge/gateway`)
- [ ] Implement JWT / OAuth2 Authentication & RBAC Guards.
- [ ] Configure dynamic rate-limiting (`@nestjs/throttler` backed by Redis).
- [ ] Add Request/Response Logging & Distributed Tracing (`pino-http`, OpenTelemetry headers).
- [ ] Set up Proxy / Load Balancer routing to downstream microservices via HTTP / TCP / gRPC.

## Phase 3: Core Microservices Implementation
- [ ] **User Service (`@gateforge/user-service`)**:
  - User registration, profile management, password hashing, and role persistence using Prisma & PostgreSQL.
- [ ] **Order Service (`@gateforge/order-service`)**:
  - Lifecycle management of orders, transactional consistency, and event emission via Redis Pub/Sub.
- [ ] **AI Service (`@gateforge/ai-service`)**:
  - Integration with LLM APIs (e.g., Google Gemini), prompt orchestration, caching, and rate-metered processing.

## Phase 4: Observability, CI/CD & Deployment
- [ ] Centralized health check endpoints (`@nestjs/terminus`) aggregating gateway and service statuses.
- [ ] Multi-stage Dockerfiles for optimized production container builds of each workspace package.
- [ ] CI/CD pipeline configuration (CircleCI / GitHub Actions) running `pnpm -r test` and `pnpm -r build`.
- [ ] Cloud deployment orchestration via NestJS Mau / Kubernetes / AWS ECS.
