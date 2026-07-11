import './tracing'; // Must be imported before anything else

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ServiceName } from '@gateforge/shared';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true } // Buffer logs until Pino is ready
  );
  
  app.useLogger(app.get(Logger));

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`[GateForge] ${ServiceName.GATEWAY} running on http://localhost:${port}`);
}
bootstrap();
