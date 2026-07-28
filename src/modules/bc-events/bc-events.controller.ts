import { Controller } from '@nestjs/common';
import {
  Ctx,
  EventPattern,
  KafkaContext,
  Payload,
} from '@nestjs/microservices';

import { KAFKA_TOPICS } from '../../shared/kafka/constants/kafka-topics.constant';
import { KafkaMessageMeta } from '../../shared/kafka/types/kafka.type';
import { BcEventsService } from './bc-events.service';

/**
 * Kafka entry point for Business Central. Validation, mapping and persistence live
 * in the services; this class only unwraps the message.
 */
@Controller()
export class BcEventsController {
  constructor(private readonly bcEventsService: BcEventsService) {}

  @EventPattern(KAFKA_TOPICS.bcProduct)
  public async handleProduct(
    @Payload() payload: unknown,
    @Ctx() context: KafkaContext,
  ): Promise<void> {
    await this.bcEventsService.ingestProduct(payload, toMessageMeta(context));
  }

  @EventPattern(KAFKA_TOPICS.bcStock)
  public async handleStock(
    @Payload() payload: unknown,
    @Ctx() context: KafkaContext,
  ): Promise<void> {
    await this.bcEventsService.ingestStock(payload, toMessageMeta(context));
  }
}

function toMessageMeta(context: KafkaContext): KafkaMessageMeta {
  const message = context.getMessage();

  return {
    topic: context.getTopic(),
    partition: context.getPartition(),
    offset: message.offset,
    key: message.key?.toString(),
  };
}
