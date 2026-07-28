import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { environment } from '../shared/config/app.config.constants';
import { EEnvironment } from '../shared/config/environment.config';
import { validateEnvironmentConfig } from '../shared/config/environment.validation';
import { SharedModule } from '../shared/shared.module';
import { BcEventsModule } from './bc-events/bc-events.module';
import { EcomModule } from './ecom/ecom.module';
import { HealthModule } from './health/health.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { StockModule } from './stock/stock.module';

const isLocalLike =
  environment === EEnvironment.Local ||
  environment === EEnvironment.Development;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironmentConfig,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // Human-readable while developing; one JSON object per line otherwise,
        // so a log shipper can parse it.
        transport: isLocalLike
          ? {
              target: 'pino-pretty',
              options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
            }
          : undefined,
        autoLogging: {
          ignore: (request) => {
            const url = (request as { url?: string }).url ?? '';
            return url.startsWith('/health') || url.startsWith('/docs');
          },
        },
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie'],
          censor: '[redacted]',
        },
        customProps: () => ({ service: 'layer-backend' }),
      },
    }),

    SharedModule,

    StockModule,
    EcomModule,
    BcEventsModule,
    PipelineModule,
    HealthModule,
  ],
})
export class AppModule {}
