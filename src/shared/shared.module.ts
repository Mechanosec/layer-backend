import { Global, Module } from '@nestjs/common';

import { AppConfigService } from './config/app-config.service';
import { DatabaseService } from './database/database.service';
import { EcomApiService } from './ecom-api/ecom-api.service';
import { KafkaAdminService } from './kafka/kafka-admin.service';
import { KafkaProducerService } from './kafka/kafka-producer.service';

/**
 * Integrations and third-party clients. Global, so feature modules under
 * src/modules can inject them without repeating imports.
 */
@Global()
@Module({
  providers: [
    AppConfigService,
    DatabaseService,
    EcomApiService,
    KafkaAdminService,
    KafkaProducerService,
  ],
  exports: [
    AppConfigService,
    DatabaseService,
    EcomApiService,
    KafkaProducerService,
  ],
})
export class SharedModule {}
