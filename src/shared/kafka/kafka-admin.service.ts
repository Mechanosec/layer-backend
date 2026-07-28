import { Injectable } from '@nestjs/common';
import { Kafka } from 'kafkajs';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../config/app-config.service';
import { KAFKA_TOPICS } from './constants/kafka-topics.constant';

/**
 * Creates the topics the service uses before anything subscribes to them.
 *
 * Broker-side auto-creation is lazy: a consumer that subscribes to a topic nobody
 * has produced to yet gets UNKNOWN_TOPIC_OR_PARTITION, and kafkajs treats that as
 * fatal. Creating them up front removes the race.
 *
 * Called explicitly from `main.ts` before the consumer connects rather than from
 * `onModuleInit`. The ordering is the whole point of this class, so it is stated
 * in the bootstrap sequence instead of left to lifecycle-hook order.
 */
@Injectable()
export class KafkaAdminService {
  /** Keyed messages keep a variant on one partition, so its events stay ordered. */
  private static readonly PARTITIONS = 3;
  /** Single-node broker locally; raise together with the broker count. */
  private static readonly REPLICATION_FACTOR = 1;
  private static readonly LEADER_ATTEMPTS = 20;
  private static readonly LEADER_RETRY_DELAY_MS = 250;

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

  public async ensureTopics(): Promise<void> {
    const admin = this.kafka.admin();

    try {
      await admin.connect();

      const existing = new Set(await admin.listTopics());
      const missing = Object.values(KAFKA_TOPICS).filter(
        (topic) => !existing.has(topic),
      );

      if (missing.length > 0) {
        try {
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
        } catch (error) {
          // Two instances booting together race here. Losing that race is fine —
          // the topic exists, which is all this method is for. Anything else is not.
          if (!isAlreadyExists(error)) {
            throw error;
          }

          this.logger.info(
            `[${KafkaAdminService.name}]Topic(s) already created by another instance`,
          );
        }
      }

      // `waitForLeaders` is not enough on a freshly created topic: the consumer
      // that subscribes moments later can still get metadata without a leader,
      // and kafkajs treats that as fatal. So wait until every partition has one.
      await this.waitForLeaders(admin, Object.values(KAFKA_TOPICS));
    } finally {
      await admin.disconnect();
    }
  }

  private async waitForLeaders(
    admin: ReturnType<Kafka['admin']>,
    topics: string[],
  ): Promise<void> {
    for (
      let attempt = 1;
      attempt <= KafkaAdminService.LEADER_ATTEMPTS;
      attempt += 1
    ) {
      const metadata = await admin.fetchTopicMetadata({ topics });

      const ready = metadata.topics.every(
        (topic) =>
          topic.partitions.length > 0 &&
          topic.partitions.every((partition) => partition.leader >= 0),
      );

      if (ready) {
        return;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, KafkaAdminService.LEADER_RETRY_DELAY_MS),
      );
    }

    this.logger.warn(
      `[${KafkaAdminService.name}]Some partitions still have no leader; the consumer may fail to subscribe`,
    );
  }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'KafkaJSTopicAlreadyExists' ||
      /already exists/i.test(error.message))
  );
}
