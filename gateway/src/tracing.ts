import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTLP_TRACE_URL || 'http://localhost:4318/v1/traces',
});

export const otelSDK = new NodeSDK({
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

// Start the SDK and gracefully shutdown
otelSDK.start();

process.on('SIGTERM', () => {
  otelSDK.shutdown().then(
    () => console.log('Tracing terminated'),
    (err) => console.error('Error terminating tracing', err),
  );
});
