import { DocumentBuilder } from '@nestjs/swagger';

import { KAFKA_TOPICS } from '../kafka/constants/kafka-topics.constant';

export enum ESwaggerApiTag {
  Stock = 'stock',
  Pipeline = 'pipeline',
  Health = 'health',
  BusinessCentralDev = 'business-central (dev only)',
}

export const swaggerConfig = new DocumentBuilder()
  .setTitle('Layer service')
  .setDescription(
    [
      'Consumes stock events from Business Central over Kafka, stores the per-shop',
      'picture of stock, derives the quantity available to e-com, and publishes it back onto Kafka.',
      '',
      `Consumed topics: \`${KAFKA_TOPICS.bcProduct}\` (product master data), \`${KAFKA_TOPICS.bcStock}\` (quantities).`,
      `Produced topic: \`${KAFKA_TOPICS.ecomStock}\`.`,
    ].join('\n'),
  )
  .setVersion('0.1')
  .build();
