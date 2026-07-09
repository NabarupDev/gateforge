import { ServiceName } from '@gateforge/shared';

async function bootstrap() {
  console.log(`[GateForge] Starting ${ServiceName.AI_SERVICE}...`);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error(`Error starting ai-service:`, err);
    process.exit(1);
  });
}
