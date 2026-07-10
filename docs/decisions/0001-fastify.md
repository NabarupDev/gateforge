# ADR 0001: Selection of Fastify as the Gateway HTTP Engine

## Status
Accepted

## Context
NestJS supports two primary HTTP server adapters out of the box: **Express** (the default) and **Fastify**. 
As GateForge acts as the primary entry point for all incoming network traffic across the entire microservice ecosystem, its HTTP server adapter directly impacts the baseline throughput, memory footprint, and latency of every API request.

## Decision
We decided to adopt **`@nestjs/platform-fastify` (`FastifyAdapter`)** as the core HTTP adapter for GateForge (`gateway/src/main.ts`), while allowing downstream microservices (`user-service`, etc.) to use either Express or Fastify depending on their specific requirements.

## Rationale
1. **Throughput Performance**: Benchmarks consistently demonstrate that Fastify processes up to 30,000+ requests per second compared to Express (~15,000 req/sec) on equivalent hardware, due to its highly optimized router (`find-my-way`) and internal JSON serialization engine (`fast-json-stringify`).
2. **Lower CPU & Overhead**: In an API Gateway where ~80-90% of requests are simply inspected (headers/JWT validation) and forwarded downstream without heavy compute, Fastify introduces significantly less async event loop overhead.
3. **Native Schema Validation Support**: Fastify natively supports JSON schema validation, enabling ultra-fast payload inspection before requests ever reach downstream services.

## Consequences
- **Positive**: Higher baseline throughput and lower latency overhead per proxied request.
- **Trade-offs**: Raw Express middleware (`req`/`res` mutation libraries like `cors` or `passport` middleware designed strictly for Node/Express HTTP ServerResponse) must be wrapped or adapted using Fastify-compatible equivalents (`@fastify/cors`, `FastifyReply` methods like `.header()` vs `.setHeader()`). Our `ProxyController` and `LoggingInterceptor` were specifically engineered to check response method availability (`res.header || res.setHeader`) to maintain complete dual-compatibility across both adapters.
