import { ServiceName } from '@gateforge/shared';

async function bootstrap() {
  console.log(`[GateForge] Starting ${ServiceName.USER_SERVICE}...`);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error(`Error starting user-service:`, err);
    process.exit(1);
  });
}
