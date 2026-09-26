import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadEnvFile } from './config/load-env-file';
import { ERROR_REPORTER, type ErrorReporter } from './modules/monitoring/ports/error-reporter';

async function main(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') loadEnvFile();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = configureApp(app);

  // Crashes outside a request (uncaught exceptions and unhandled rejections) are reported
  // first; the monitor does not change Node's behaviour, so the process still exits and the
  // container restarts.
  const reporter = app.get<ErrorReporter>(ERROR_REPORTER);
  process.on('uncaughtExceptionMonitor', (error) => reporter.report(error, { source: 'process' }));

  await app.listen(config.PORT);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
