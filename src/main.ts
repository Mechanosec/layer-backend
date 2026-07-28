import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './modules/app.module';
import { AppConfigService } from './shared/config/app-config.service';
import { PrismaExceptionFilter } from './shared/filters/prisma-exception.filter';
import { KafkaAdminService } from './shared/kafka/kafka-admin.service';
import { swaggerConfig } from './shared/swagger/swagger.util';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.flushLogs();

  const logger = app.get(Logger);
  const appConfigService = app.get(AppConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(
    new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter),
  );
  app.enableCors({ origin: appConfigService.corsOrigins });
  app.enableShutdownHooks();

  if (appConfigService.swaggerEnabled) {
    SwaggerModule.setup(
      appConfigService.swaggerPath,
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  // Topics must exist before the consumer subscribes: a missing topic is fatal to
  // kafkajs, and broker-side auto-creation is too late.
  await app.get(KafkaAdminService).ensureTopics();

  // The Kafka consumer runs inside the HTTP process; `inheritAppConfig` gives
  // event handlers the same pipes and filters as the REST endpoints.
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: appConfigService.kafkaClientId,
          brokers: appConfigService.kafkaBrokers,
        },
        consumer: {
          groupId: appConfigService.kafkaConsumerGroup,
          allowAutoTopicCreation: true,
        },
      },
    },
    { inheritAppConfig: true },
  );

  await app.startAllMicroservices();
  await app.listen(appConfigService.port);

  logger.log(
    `Layer service listening on :${appConfigService.port}` +
      (appConfigService.swaggerEnabled
        ? ` — docs at /${appConfigService.swaggerPath}`
        : ''),
  );
  logger.log(
    `Kafka brokers: ${appConfigService.kafkaBrokers.join(', ')} (group ${appConfigService.kafkaConsumerGroup})`,
  );
}

void bootstrap();
