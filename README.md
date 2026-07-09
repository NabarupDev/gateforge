# GateForge Monorepo

GateForge is a scalable, enterprise-grade backend architecture built with **NestJS**, structured as a **pnpm monorepo**. It combines an **API Gateway** with specialized backend microservices (`user-service`, `order-service`, `ai-service`) and a shared types/DTO layer (`shared`).

## Repository Structure

```text
GateForge/
├── gateway/          # API Gateway (@gateforge/gateway)
├── services/
│   ├── user-service/ # User & Identity Service (@gateforge/user-service)
│   ├── order-service/# Order Processing Service (@gateforge/order-service)
│   └── ai-service/   # AI Integration & Processing Service (@gateforge/ai-service)
├── shared/           # Shared DTOs, Types, and Utilities (@gateforge/shared)
├── docker-compose.yml# Centralized local dev infrastructure (Postgres, Redis, pgAdmin)
├── pnpm-workspace.yaml# pnpm workspace configuration
├── README.md         # Monorepo documentation
└── ROADMAP.md        # Architectural roadmap and milestones
```

## Getting Started

### Prerequisites
- [Node.js v20+](https://nodejs.org/)
- [pnpm v9+](https://pnpm.io/)
- [Docker & Docker Compose](https://www.docker.com/)

### Installation & Setup

1. **Install dependencies across all workspaces:**
   ```bash
   pnpm install
   ```

2. **Start Local Infrastructure (PostgreSQL & Redis):**
   ```bash
   docker-compose up -d
   ```

3. **Build all packages & services:**
   ```bash
   pnpm -r build
   ```

## Running Services

You can run services individually or concurrently using pnpm filter commands from the monorepo root:

```bash
# Start API Gateway in dev/watch mode
pnpm --filter @gateforge/gateway start:dev

# Start specific microservice in dev/watch mode
pnpm --filter @gateforge/user-service start:dev
pnpm --filter @gateforge/order-service start:dev
pnpm --filter @gateforge/ai-service start:dev
```

## Testing

```bash
# Run unit tests across all workspace packages
pnpm -r test

# Run e2e tests
pnpm -r test:e2e
```

## Architecture Notes

- **API Gateway (`gateway/`)**: Handles authentication, routing, rate-limiting, and request forwarding to downstream microservices.
- **Shared Module (`shared/`)**: Exported as `@gateforge/shared` using `workspace:*` dependencies in `package.json`. Ensures strict end-to-end type safety between the gateway and internal services without npm publishing.
