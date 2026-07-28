import { Injectable, OnModuleInit } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../config/app-config.service';
import { KAFKA_TOPICS } from './constants/kafka-topics.constant';

/**
 * Creates the topics the service uses before anything subscribes to them.
 *
 * Broker-side auto-creation is lazy: a consumer that subscribes to a topic
 * nobody has produced to yet gets UNKNOWN_TOPIC_OR_PARTITION and kafkajs treats
 * that as fatal. Creating them up front removes the race.
 */
@Injectable()
export class KafkaAdminService implements OnModuleInit {
  /** Keyed messages keep a variant on one partition, so its events stay ordered. */
  private static readonly PARTITIONS = 3;
  /** Single-node broker locally; raise together with the broker count. */
  private static readonly REPLICATION_FACTOR = 1;

  private readonly kafka: Kafka;

  constructor(
    private readonly logger: PinoLogger,
    appConfigService: AppConfigService,
  ) {
    this.kafka = new Kafka({
      clientId: `${appConfigService.kafkaClientId}-admin`,
      brokers: appConfigService.kafkaBrokers,
      retry: { retries: 8, initialRetryTime: 300 },
    });
  }

  async onModuleInit(): Promise<void> {
    const admin = this.kafka.admin();

    try {
      await admin.connect();

      const existing = new Set(await admin.listTopics());
      const missing = Object.values(KAFKA_TOPICS).filter(
        (topic) => !existing.has(topic),
      );

      if (missing.length === 0) {
        return;
      }

      await admin.createTopics({
        topics: missing.map((topic) => ({
          topic,
          numPartitions: KafkaAdminService.PARTITIONS,
          replicationFactor: KafkaAdminService.REPLICATION_FACTOR,
        })),
        waitForLeaders: true,
      });

      this.logger.info(
        `[${KafkaAdminService.name}]Created topic(s): ${missing.join(', ')}`,
      );
    } finally {
      await admin.disconnect();
    }
  }
}
