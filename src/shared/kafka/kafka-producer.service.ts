import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer, RecordMetadata } from 'kafkajs';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../config/app-config.service';
import { describeError, handleExceptionCode } from '../utils/utils';
import { OutgoingMessage } from './types/kafka.type';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly producer: Producer;

  constructor(
    private readonly logger: PinoLogger,
    appConfigService: AppConfigService,
  ) {
    this.producer = new Kafka({
      clientId: `${appConfigService.kafkaClientId}-producer`,
      brokers: appConfigService.kafkaBrokers,
      // Kafka may still be starting when the app boots (compose brings both up
      // together), so retry instead of killing the process.
      retry: { retries: 8, initialRetryTime: 300 },
    }).producer({ allowAutoTopicCreation: true, idempotent: true });
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    this.logger.info(`[${KafkaProducerService.name}]Producer connected`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  public async publish(
    topic: string,
    messages: OutgoingMessage[],
  ): Promise<RecordMetadata[]> {
    if (messages.length === 0) {
      return [];
    }

    try {
      return await this.producer.send({
        topic,
        messages: messages.map((message) => ({
          key: message.key,
          value: JSON.stringify(message.value),
        })),
      });
    } catch (error) {
      const errorMessage = `[${KafkaProducerService.name}]Sending ${messages.length} message(s) to ${topic} was failed`;
      this.logger.error(errorMessage + ` with error: ${describeError(error)}`);
      throw handleExceptionCode(error as Error, errorMessage);
    }
  }
}
