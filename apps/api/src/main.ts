import './instrument.js';

import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './modules/app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix('api/v1');
  app.use(
    (
      request: { header(name: string): string | undefined; requestId?: string },
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      const requestId = request.header('x-request-id') ?? randomUUID();
      request.requestId = requestId;
      response.setHeader('x-request-id', requestId);
      next();
    },
  );
  await app.listen(Number(process.env.PORT ?? 3001));
}

void bootstrap();
