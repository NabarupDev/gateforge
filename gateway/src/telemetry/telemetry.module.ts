import { Module, Global } from '@nestjs/common';
import { PrometheusModule, makeCounterProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';

export const GATEFORGE_REQUESTS_TOTAL = 'gateforge_requests_total';
export const GATEFORGE_REQUEST_DURATION = 'gateforge_request_duration_seconds';
export const GATEFORGE_CACHE_HITS = 'gateforge_cache_hits_total';
export const GATEFORGE_CACHE_MISSES = 'gateforge_cache_misses_total';
export const GATEFORGE_RETRY_TOTAL = 'gateforge_retry_total';
export const GATEFORGE_CIRCUIT_OPEN = 'gateforge_circuit_open_total';
export const GATEFORGE_RATE_LIMIT_REJECTIONS = 'gateforge_rate_limit_rejections_total';

const providers = [
  makeCounterProvider({
    name: GATEFORGE_REQUESTS_TOTAL,
    help: 'Total number of gateway requests',
    labelNames: ['method', 'status', 'service'],
  }),
  makeHistogramProvider({
    name: GATEFORGE_REQUEST_DURATION,
    help: 'Latency of gateway requests',
    labelNames: ['method', 'status', 'service'],
    buckets: [0.005, 0.010, 0.020, 0.050, 0.100, 0.250, 0.500, 1, 2, 5],
  }),
  makeCounterProvider({
    name: GATEFORGE_CACHE_HITS,
    help: 'Total cache hits',
    labelNames: ['service'],
  }),
  makeCounterProvider({
    name: GATEFORGE_CACHE_MISSES,
    help: 'Total cache misses',
    labelNames: ['service'],
  }),
  makeCounterProvider({
    name: GATEFORGE_RETRY_TOTAL,
    help: 'Total number of retries executed',
    labelNames: ['service'],
  }),
  makeCounterProvider({
    name: GATEFORGE_CIRCUIT_OPEN,
    help: 'Total number of circuit breaker open events',
    labelNames: ['service', 'instance'],
  }),
  makeCounterProvider({
    name: GATEFORGE_RATE_LIMIT_REJECTIONS,
    help: 'Total rate limit rejections',
    labelNames: ['service'],
  }),
];

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  providers: [...providers],
  exports: [...providers],
})
export class TelemetryModule {}
