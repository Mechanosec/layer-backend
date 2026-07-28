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
 * Kafka entry point for Business Central stock events. Validation and
 * persistence live in the services; this class only unwraps the message.
 */
@Controller()
export class BcEventsController {
  constructor(private readonly bcEventsService: BcEventsService) {}

  @EventPattern(KAFKA_TOPICS.bcStockGlobal)
  public async handleGlobal(
    @Payload() payload: unknown,
    @Ctx() context: KafkaContext,
  ): Promise<void> {
    await this.bcEventsService.ingestGlobal(payload, toMessageMeta(context));
  }

  @EventPattern(KAFKA_TOPICS.bcStockUnit)
  public async handleUnit(
    @Payload() payload: unknown,
    @Ctx() context: KafkaContext,
  ): Promise<void> {
    await this.bcEventsService.ingestUnit(payload, toMessageMeta(context));
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
