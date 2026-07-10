# ADR 0002: Axios Reverse Proxy Engine vs. Streaming Proxying

## Status
Accepted (Phase 1 & Phase 2) — Scheduled for replacement in v0.8 (Streaming Proxy)

## Context
When implementing the reverse proxy forwarding logic inside `ProxyService`, we needed an HTTP client to take the incoming client request and forward its headers, query parameters, method, and body to the configured downstream target URL (`http://localhost:3001`).

## Decision
For Phases 1 and 2, we decided to implement the reverse proxy using **Axios (`@nestjs/axios`)** with `validateStatus: () => true` to handle HTTP forwarding.

## Rationale
1. **Engineering Clarity & Speed**: Axios provides a clean, well-understood Promise-based API (`firstValueFrom(httpService.request(config))`) that integrates seamlessly into NestJS lifecycle and dependency injection (`HttpModule`).
2. **Reliable Error Inspection**: Setting `validateStatus: () => true` ensures Axios never throws unhandled exceptions on HTTP 4xx/5xx responses from backend services, making it straightforward to inspect status codes and forward downstream error bodies cleanly.
3. **Rock-Solid Baseline for Auth/RBAC Verification**: During initial gateway development (Phase 1/2), having an in-memory buffered request/response allows easy testing of header injection, JWT validation, and console logging.

## Consequences & Roadmap to Streaming (v0.8)
- **Buffer Limitation**: Axios buffers the entire request payload into memory before sending, and buffers the entire downstream response before sending it back to the client. This breaks or severely degrades performance under:
  - Large file uploads (multi-gigabyte files).
  - Video or audio streaming.
  - Server-Sent Events (SSE) or long-polling HTTP streams.
- **Next Steps (v0.8 Upgrade)**: Around version v0.8, after core features (auth, rate limiting, and observability) are mature, `ProxyService` will be refactored to use **Node native streams (`http-proxy` / `undici` / `stream.pipe`)**:
  ```text
  Client Stream ──► Gateway Socket ──► Backend Stream (Zero-buffer pass-through)
  ```
