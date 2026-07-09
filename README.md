# GateForge Monorepo

GateForge is an enterprise-grade API Gateway and microservice ecosystem built with **NestJS**, **Fastify**, and structured as a **pnpm monorepo**. It acts as the central entry point for backend microservices, handling reverse proxying, request/response logging, and service routing with strict end-to-end type safety via `@gateforge/shared`.

## Architecture Overview

```text
       Client / Consumer
               │
               ▼
      ┌────────────────┐
      │  API Gateway   │  (Port 3000 - NestJS + Fastify)
      │ (@gateforge/   │  ──► Logging Interceptor
      │    gateway)    │  ──► Health Endpoint (/health)
      └───────┬────────┘  ──► Reverse Proxy Service
              │
              ▼
      ┌────────────────┐
      │  User Service  │  (Port 3001 - Express REST API)
      │ (@gateforge/   │  ──► Users CRUD endpoints
      │  user-service) │  ──► In-memory store
      └────────────────┘
```

## Features Completed (Phase 1)

- [x] **Reverse Proxy Core**: Catch-all routing forwarding method, path, query parameters, headers, and JSON body to target microservices (`axios` powered).
- [x] **Connection Failure Handling**: Automatic `502 Bad Gateway` JSON response when downstream target services are unreachable or offline.
- [x] **Header Cleanliness**: Automatic stripping of hop-by-hop headers (`host`, `connection`, `transfer-encoding`, etc.) on incoming requests and outgoing responses.
- [x] **HTTP Method Support**: Full support for `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`.
- [x] **Request/Response Logging**: Global interceptor logging method, path, target URL, processing time (in `ms`), and response status code to the console.
- [x] **Gateway Health Check**: Dedicated `GET /health` endpoint verifying gateway uptime and status before reaching downstream routes.
- [x] **User Microservice**: Lightweight Express API (`:3001`) simulating identity management and user CRUD operations for end-to-end proxy testing.

## Repository Structure

```text
GateForge/
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

