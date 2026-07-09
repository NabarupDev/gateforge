import { ServiceName } from '@gateforge/shared';

async function bootstrap() {
  console.log(`[GateForge] Starting ${ServiceName.ORDER_SERVICE}...`);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error(`Error starting order-service:`, err);
    process.exit(1);
  });
}
