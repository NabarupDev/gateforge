# GateForge Routing Architecture & Roadmap

GateForge uses a dynamic prefix-matching routing system to forward external HTTP requests to internal microservices.

## Phase 1 & 2 Routing Configuration (`gateway.config.ts`)

Currently, route rules are defined inside `gateway/src/config/gateway.config.ts` using NestJS `ConfigModule`:

```typescript
export interface RouteConfig {
  pathPrefix: string;
  target: string;
  isPublic?: boolean;
  requiredRoles?: string[];
}
```

### Route Matching Algorithm
When a request enters `ProxyController` (`@All('*')`), `ProxyService`:
1. Extracts `urlPath` (`req.url`).
2. Iterates over `gateway.routes` and finds the first route where `urlPath.startsWith(route.pathPrefix)`.
3. Constructs the downstream target URL (`${matchedRoute.target}${urlPath}`).
4. If no route matches, throws `404 Not Found` with `code: 'ROUTE_NOT_FOUND'`.

## Future Roadmap: Database-Backed Dynamic Routing (v0.6 - v0.8)

As microservices scale and dynamic deployments occur, static file configuration (`gateway.config.ts`) requires gateway restarts. To solve this, routing will transition to a **Database-Backed Dynamic Route Engine**:

```text
┌─────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│ Admin Dashboard ├──────►│ PostgreSQL DB    ├──────►│ Gateway Cache   │
│ (Add/Edit Route)│       │ (services table) │       │ (Redis/Memory)  │
└─────────────────┘       └──────────────────┘       └─────────────────┘
```

### Proposed Database Schema (`services` table)
```sql
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  path_prefix VARCHAR(255) NOT NULL UNIQUE,
  target_url VARCHAR(255) NOT NULL,
  is_public BOOLEAN DEFAULT false,
  required_roles TEXT[] DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Operational Workflow
1. **Startup**: On bootstrap, `ProxyModule` loads active routes from PostgreSQL into in-memory/Redis cache (`RouteTable`).
2. **Runtime Verification**: `ProxyService` looks up path matches in the in-memory `RouteTable` (`O(1)` or `O(n)` prefix tree/trie lookup) with zero database latency per request.
3. **Admin Updates**: When an administrator adds or disables a service via the Admin Dashboard (`POST /admin/routes`), the gateway receives a Redis Pub/Sub event (`ROUTE_TABLE_UPDATED`) and reloads the memory cache instantly without downtime.
