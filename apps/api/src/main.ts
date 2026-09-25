import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadEnvFile } from './config/load-env-file';

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') loadEnvFile();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = configureApp(app);
  await app.listen(config.PORT);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
