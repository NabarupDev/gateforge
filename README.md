# GateForge Monorepo

GateForge is an enterprise-grade API Gateway and microservice ecosystem built with **NestJS**, **Fastify**, and structured as a **pnpm monorepo**. It acts as the central entry point for backend microservices, handling edge authentication, Role-Based Access Control (RBAC), identity forwarding (`x-user-*` headers), reverse proxying, request logging, and service routing with strict end-to-end type safety via `@gateforge/shared`.

## Architecture Overview

```text
       Client / Consumer (Bearer JWT)
               │
               ▼
      ┌─────────────────────────────────┐
      │           API Gateway           │  (Port 3000 - NestJS + Fastify)
      │      (@gateforge/gateway)       │  ──► GatewayAuthGuard (JWT & RBAC verification)
      │                                 │  ──► Injects x-user-id, x-user-email, x-user-role
      │                                 │  ──► Logging Interceptor & Health Endpoint
      └────────────────┬────────────────┘  ──► Reverse Proxy Service
                       │
                       ▼ (HTTP + Injected Identity Headers)
      ┌─────────────────────────────────┐
      │          User Service           │  (Port 3001 - Express REST API)
      │   (@gateforge/user-service)     │  ──► Reads x-user-* headers directly
      │                                 │  ──► Users & Admin CRUD endpoints
      └─────────────────────────────────┘
```

## Features Completed (Phase 1 & Phase 2)

- [x] **Edge JWT Authentication & RBAC**: Centralized `GatewayAuthGuard` verifying JWT signatures and role requirements (`@Roles('admin')` or `gateway.config.ts` requiredRoles) at the edge (`401 Unauthorized` / `403 Forbidden`).
- [x] **Identity Header Forwarding**: Downstream microservices never parse JWTs. GateForge extracts claims and injects clean `x-user-id`, `x-user-email`, and `x-user-role` headers into proxied HTTP requests.
- [x] **Public & Protected Route Management**: Supports `@Public()` decorator overrides (`GET /health`, `POST /auth/token`) alongside dynamic route config rules (`isPublic: false`).
- [x] **Architecture Decision Records (`/docs`)**: Dedicated documentation folder with deep engineering trade-off specs (`0001-fastify.md`, `0002-axios-proxy.md`, `0003-route-config.md`).
- [x] **Reverse Proxy Core**: Catch-all routing forwarding method, path, query parameters, headers, and JSON body to target microservices (`axios` powered with hop-by-hop header cleanup).
- [x] **Connection Failure Handling**: Automatic `502 Bad Gateway` JSON response when downstream target services are unreachable or offline.
- [x] **Request/Response Logging**: Global interceptor logging method, path, target URL, processing time (in `ms`), and response status code (`Incoming Request` console formatting).
- [x] **User Microservice**: Lightweight Express API (`:3001`) with endpoints (`/users`, `/users/me`, `/admin`) to test identity injection and RBAC.

## Repository Structure

```text
GateForge/
├── docs/             # Architecture Decision Records (ADRs) & technical design specs
│   ├── architecture.md, routing.md, proxy-flow.md, authentication.md...
│   └── decisions/    # 0001-fastify.md, 0002-axios-proxy.md, 0003-route-config.md
├── gateway/          # API Gateway (@gateforge/gateway) [Port 3000]
├── services/
│   ├── user-service/ # User & Identity Service (@gateforge/user-service) [Port 3001]
│   ├── order-service/# Order Processing Service (@gateforge/order-service)
│   └── ai-service/   # AI Integration Service (@gateforge/ai-service)
├── shared/           # Shared DTOs, Types, and Utilities (@gateforge/shared)
├── docker-compose.yml# Centralized local infrastructure (Postgres, Redis, pgAdmin)
├── pnpm-workspace.yaml# pnpm workspace configuration
└── README.md         # Documentation
```

## Getting Started

### Prerequisites
- [Node.js v20+](https://nodejs.org/)
- [pnpm v9+](https://pnpm.io/)

### Installation

1. **Install dependencies across the monorepo:**
   ```bash
   pnpm install
   ```

2. **Build all packages & services:**
   ```bash
   pnpm -r build
   ```

## Running the Application

Open two terminal windows (or run in background) from the monorepo root:

1. **Start the User Service (`:3001`):**
   ```bash
   pnpm --filter @gateforge/user-service start:dev
   ```

2. **Start the API Gateway (`:3000`):**
   ```bash
   pnpm --filter @gateforge/gateway start:dev
   ```

## API Examples

You can test the gateway behavior using `curl` or Postman targeting `http://localhost:3000`.

### 1. Gateway Health Check
```bash
curl -s http://localhost:3000/health
```
**Response (200 OK):**
```json
{
  "status": "ok",
  "gateway": "GateForge",
  "uptime": 123
}
```

### 2. Get All Users (Proxied to User Service)
```bash
curl -i http://localhost:3000/users
```
**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    { "id": "1", "name": "Alice Smith", "email": "alice@gateforge.com", "role": "admin" },
    { "id": "2", "name": "Bob Jones", "email": "bob@gateforge.com", "role": "user" },
    { "id": "3", "name": "Charlie Brown", "email": "charlie@gateforge.com", "role": "user" }
  ],
  "timestamp": "2026-07-09T12:59:31.180Z"
}
```

### 3. Get User By ID
```bash
curl -i http://localhost:3000/users/1
```

### 4. Create User
```bash
curl -i -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"David Miller","email":"david@gateforge.com","role":"dev"}'
```
**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": "4",
    "name": "David Miller",
    "email": "david@gateforge.com",
    "role": "dev"
  },
  "timestamp": "2026-07-09T13:00:18.152Z"
}
```

### 5. Update User
```bash
curl -i -X PUT http://localhost:3000/users/1 \
  -H "Content-Type: application/json" \
  -d '{"role":"superadmin"}'
```

### 6. Delete User
```bash
curl -i -X DELETE http://localhost:3000/users/1
```

### 7. Test Connection Failure (502 Bad Gateway)
If `user-service` is stopped while the gateway is running:
```bash
curl -i http://localhost:3000/users
```
**Response (502 Bad Gateway):**
```json
{
  "success": false,
  "error": {
    "code": "BAD_GATEWAY",
    "message": "Backend service at http://localhost:3001 is unreachable or connection failed",
    "details": ""
  },
  "timestamp": "2026-07-09T13:00:52.023Z"
}
```

## Logging Output Example

For every request processed by the gateway, formatted request details are output to the console:

```text
Incoming Request

Method : GET
Path   : /users
Target : http://localhost:3001/users
Time   : 27ms
Status : 200
```

