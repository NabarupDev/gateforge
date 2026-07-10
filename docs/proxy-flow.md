# GateForge Proxy Sequence & Request Flow

This document outlines the detailed sequence diagram and execution steps for every proxied request passing through GateForge.

## Request Flow Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Fastify as Fastify HTTP Engine
    participant Interceptor as LoggingInterceptor
    participant Guard as GatewayAuthGuard
    participant ProxyCtrl as ProxyController
    participant ProxySvc as ProxyService
    participant Backend as User Service (:3001)

    Client->>Fastify: HTTP GET /users/1 (Bearer Token)
    Fastify->>Interceptor: Intercept Request Start (Record t0)
    Interceptor->>Guard: canActivate(context)
    
    alt Route is Public
        Guard-->>ProxyCtrl: Allow Request (true)
    else Route is Protected
        Guard->>Guard: Verify JWT with secret
        alt Invalid / Missing Token
            Guard-->>Client: 401 Unauthorized JSON
        else Valid Token
            Guard->>Guard: Check Required Roles vs Token Claims
            alt Role Mismatch
                Guard-->>Client: 403 Forbidden JSON
            else Authorized
                Guard->>Guard: Inject req.headers['x-user-*']
                Guard-->>ProxyCtrl: Allow Request (true)
            end
        end
    end

    ProxyCtrl->>ProxySvc: forwardRequest(req)
    ProxySvc->>ProxySvc: Match target from route config
    ProxySvc->>ProxySvc: Strip hop-by-hop headers (host, connection)
    
    ProxySvc->>Backend: HTTP GET http://localhost:3001/users/1 + injected headers
    
    alt Backend Reachable
        Backend-->>ProxySvc: HTTP 200 OK + JSON Body
    else Connection Failure (ECONNREFUSED)
        ProxySvc-->>ProxyCtrl: HTTP 502 Bad Gateway Error JSON
    end

    ProxySvc->>ProxySvc: Strip response hop-by-hop headers
    ProxySvc-->>ProxyCtrl: ProxyResponse (status, headers, data)
    ProxyCtrl-->>Interceptor: FastifyReply (Send response)
    Interceptor->>Interceptor: Calculate duration (t1 - t0) and log console
    Interceptor-->>Client: Final HTTP Response
```

## Key Architectural Protections

1. **Hop-by-Hop Header Sanitization**: Ensures `host`, `connection`, `transfer-encoding`, and `content-length` are stripped before forwarding so target servers don't misinterpret proxy TCP streams.
2. **Never Throw on Backend Errors**: By setting `validateStatus: () => true` in Axios, 404, 400, or 500 errors returned by downstream services are forwarded directly to the client rather than causing the gateway's HTTP client to throw unhandled exceptions.
3. **Graceful Connection Failures**: If a downstream container/process is offline, GateForge catches network connection errors (`ECONNREFUSED`, `ENOTFOUND`) and returns a standardized `502 Bad Gateway` JSON response.
