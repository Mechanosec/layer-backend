import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EEnvironment, EnvironmentVariables } from './environment.config';

/**
 * Typed access to the validated environment, so nothing else in the codebase has
 * to know variable names or parse strings.
 *
 * Only deployment configuration lives here. Tuning values are constants beside
 * the code that uses them, in each module's `constants` folder.
 */
@Injectable()
export class AppConfigService {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  get environment(): EEnvironment {
    return this.configService.get('NODE_ENV', { infer: true });
  }

  get isProduction(): boolean {
    return this.environment === EEnvironment.Production;
  }

  get port(): number {
    return this.configService.get('PORT', { infer: true });
  }

  get logLevel(): string {
    return this.configService.get('LOG_LEVEL', { infer: true });
  }

  get databaseUrl(): string {
    return this.configService.get('DATABASE_URL', { infer: true });
  }

  get kafkaClientId(): string {
    return this.configService.get('KAFKA_CLIENT_ID', { infer: true });
  }

  get kafkaBrokers(): string[] {
    return this.configService
      .get('KAFKA_BROKERS', { infer: true })
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);
  }

  get kafkaConsumerGroup(): string {
    return this.configService.get('KAFKA_CONSUMER_GROUP', { infer: true });
  }

  get ecomApiUrl(): string {
    return this.configService.get('ECOM_API_URL', { infer: true });
  }

  get ecomApiToken(): string | undefined {
    return this.configService.get('ECOM_API_TOKEN', { infer: true });
  }

  get corsOrigins(): string[] | '*' {
    const raw = this.configService.get('CORS_ORIGINS', { infer: true });

    return raw.trim() === '*'
      ? '*'
      : raw
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean);
  }

  get swaggerEnabled(): boolean {
    return this.configService.get('SWAGGER_ENABLED', { infer: true });
  }

  get swaggerPath(): string {
    return this.configService.get('SWAGGER_PATH', { infer: true });
  }
}
