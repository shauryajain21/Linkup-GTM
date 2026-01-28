import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3001;

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Slack Automation Service running on port ${port}`);
  logger.log(`Endpoints:`);
  logger.log(`  POST /automations/new-user - Trigger Slack channel creation`);
  logger.log(`  POST /slack/events - Slack webhook events`);
}
bootstrap();
