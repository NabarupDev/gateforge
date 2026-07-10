# GateForge Downstream Load Balancing Specification (v0.7 Roadmap)

As downstream microservices scale, single static URL targets (`http://localhost:3001`) must be replaced with pools of healthy microservice instances. GateForge will implement an **Application-Layer Load Balancer & Health Monitor** inside `LoadBalancerModule`.

## Load Balancing Algorithms

GateForge will support multiple selectable load balancing algorithms per service:

1. **Round Robin (Default)**: Sequential distribution across all healthy instances in the target pool (`Instance A -> Instance B -> Instance C -> Instance A`).
2. **Weighted Round Robin**: Routes traffic proportionally based on instance capacity/CPU weights (`Instance A [Weight 3] gets 75% traffic, Instance B [Weight 1] gets 25%`).
3. **Least Connections**: Forwards requests to the instance currently processing the fewest active connections or concurrent HTTP requests.

## Active & Passive Health Checking

```text
┌─────────────────┐             Active Heartbeat (Every 5s)
│                 │ ──GET /health ─────────────────────────► ┌──────────────────┐
│ LoadBalancerSvc │ ◄──200 OK (Healthy) ──────────────────── │ Instance 1 (:3001) │
│                 │                                          └──────────────────┘
│ Target Pool:    │             Active Heartbeat (Every 5s)
│ - Instance 1    │ ──GET /health ─────────────────────────► ┌──────────────────┐
│ - Instance 2(X) │ ◄──Connection Refused (Mark Unhealthy) ── │ Instance 2 (:3002) │
└─────────────────┘                                          └──────────────────┘
```

### 1. Active Heartbeat Checks
- Every `5 seconds`, `LoadBalancerService` sends a lightweight `GET /health` request to every registered instance in a service pool.
- If an instance fails `3 consecutive` checks, it is removed from the active target pool (`UNHEALTHY`).
- When an unhealthy instance returns `2 consecutive` 200 OK responses, it is restored to the active pool (`HEALTHY`).

### 2. Passive Circuit Breaker Integration
- If a proxied request times out (`> 5000ms`) or returns `503 Service Unavailable` during live user traffic, the load balancer immediately marks the instance as degraded and routes subsequent requests to the remaining healthy replicas without waiting for the next active heartbeat cycle.
